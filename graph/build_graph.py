"""Dynamic wind-weighted graph over Delhi-NCR stations + Punjab/Haryana fire-source nodes.

Static part (built once, saved to config.GRAPH_FILE):
    nodes  = N stations followed by F fire-source boundary nodes (1 deg cells over FIRE_BBOX)
    edges  = station->station within EDGE_RADIUS_KM (both directions) + every fire->station
    per-edge geometry: sin/cos of the source->target bearing, static distance decay, and
    which station's wind drives the edge (source station for station edges, target station
    for fire edges, since we have no wind observations over the fire cells).

Dynamic part (every hour, including inside the model's rollout on predicted wind):
    align    = cos(angle between the wind's heading and the edge bearing)
             = (u sin b + v cos b) / |wind|
    station  w = decay * (BASE + (1 - BASE) * relu(align))   # diffusion never fully vanishes
    fire     w = decay * relu(align) ** 2                    # plumes only arrive downwind
Only arithmetic is used, so `edge_weights` works on numpy arrays and torch tensors.

Usage:
    python -m graph.build_graph
"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd

import config
from data_pipeline.common import load_stations
from preprocessing.features import bearing_deg, haversine_km

STATION_EDGE, FIRE_EDGE = 0, 1
BASE_WEIGHT = 0.2


def fire_node_grid(bbox=config.FIRE_BBOX, cell=config.FIRE_NODE_CELL_DEG) -> pd.DataFrame:
    w, s, e, n = bbox
    lats = np.arange(s + cell / 2, n, cell)
    lons = np.arange(w + cell / 2, e, cell)
    grid = [(f"fire_{la:.1f}_{lo:.1f}", la, lo) for la in lats for lo in lons]
    return pd.DataFrame(grid, columns=["fire_node_id", "lat", "lon"])


def build_static_graph(stations: pd.DataFrame, fire_nodes: pd.DataFrame | None = None,
                       radius_km: float = config.EDGE_RADIUS_KM) -> dict:
    fire_nodes = fire_node_grid() if fire_nodes is None else fire_nodes
    n_st = len(stations)
    lat = np.concatenate([stations["lat"].to_numpy(), fire_nodes["lat"].to_numpy()])
    lon = np.concatenate([stations["lon"].to_numpy(), fire_nodes["lon"].to_numpy()])

    src, dst, etype = [], [], []
    for i in range(n_st):
        for j in range(n_st):
            if i != j and haversine_km(lat[i], lon[i], lat[j], lon[j]) <= radius_km:
                src.append(i), dst.append(j), etype.append(STATION_EDGE)
    for f in range(len(fire_nodes)):
        for j in range(n_st):
            src.append(n_st + f), dst.append(j), etype.append(FIRE_EDGE)
    src, dst, etype = map(np.array, (src, dst, etype))

    dist = haversine_km(lat[src], lon[src], lat[dst], lon[dst])
    bear = np.deg2rad(bearing_deg(lat[src], lon[src], lat[dst], lon[dst]))
    decay = np.where(etype == STATION_EDGE, np.exp(-dist / config.EDGE_LENGTH_KM),
                     np.exp(-dist / config.FIRE_EDGE_DECAY_KM))
    wind_node = np.where(etype == STATION_EDGE, src, dst)
    return {
        "station_ids": stations["station_id"].tolist(),
        "station_lat": stations["lat"].tolist(), "station_lon": stations["lon"].tolist(),
        "fire_node_ids": fire_nodes["fire_node_id"].tolist(),
        "fire_lat": fire_nodes["lat"].tolist(), "fire_lon": fire_nodes["lon"].tolist(),
        "edge_index": [src.tolist(), dst.tolist()], "edge_type": etype.tolist(),
        "sin_b": np.sin(bear).tolist(), "cos_b": np.cos(bear).tolist(),
        "decay": decay.tolist(), "dist_km": dist.tolist(), "wind_node": wind_node.tolist(),
    }


def edge_weights(u, v, sin_b, cos_b, decay, is_fire):
    """Wind-dependent edge weights. u, v: wind at each edge's driving station (m/s).

    Works for numpy arrays or torch tensors of shape (..., E).
    """
    ws = (u * u + v * v + 1e-6) ** 0.5
    align = (u * sin_b + v * cos_b) / ws
    relu = (align + abs(align)) / 2
    station_w = decay * (BASE_WEIGHT + (1 - BASE_WEIGHT) * relu)
    fire_w = decay * relu * relu
    return is_fire * fire_w + (1 - is_fire) * station_w


def fire_node_features(fires: pd.DataFrame | None, fire_nodes: pd.DataFrame,
                       times: pd.DatetimeIndex, cell=config.FIRE_NODE_CELL_DEG) -> np.ndarray:
    """(T, F, 2): log1p FRP sum and log1p detection count over the trailing 24 h per fire node."""
    out = np.zeros((len(times), len(fire_nodes), 2), dtype=np.float32)
    if fires is None or fires.empty:
        return out
    w, s, _, _ = config.FIRE_BBOX
    f = fires.copy()
    f["iy"] = np.floor((f["lat"] - s) / cell).astype(int)
    f["ix"] = np.floor((f["lon"] - w) / cell).astype(int)
    nx, ny = fire_nodes["lon"].nunique(), fire_nodes["lat"].nunique()
    f = f[(f.ix >= 0) & (f.ix < nx) & (f.iy >= 0) & (f.iy < ny)]
    f["node"] = f["iy"] * nx + f["ix"]  # matches fire_node_grid row order (lat-major)
    f["time"] = f["timestamp"].dt.floor("h")
    for k, (col, agg) in enumerate((("frp", "sum"), ("frp", "count"))):
        wide = (f.pivot_table(index="time", columns="node", values=col, aggfunc=agg)
                .reindex(index=times, columns=range(len(fire_nodes)), fill_value=0).fillna(0)
                .rolling(config.FIRE_LOOKBACK_HOURS, min_periods=1).sum())
        out[:, :, k] = np.log1p(wide.to_numpy())
    return out


def save_graph(graph: dict) -> None:
    config.GRAPH_FILE.parent.mkdir(parents=True, exist_ok=True)
    config.GRAPH_FILE.write_text(json.dumps(graph))


def load_graph() -> dict:
    return json.loads(config.GRAPH_FILE.read_text())


def run() -> dict:
    stations = load_stations()
    if config.OBS_FILE.exists():  # nodes = stations that actually have processed observations
        import pyarrow.parquet as pq
        have = set(pq.read_table(config.OBS_FILE, columns=["station_id"]).column(0).unique().to_pylist())
        stations = stations[stations["station_id"].isin(have)].reset_index(drop=True)
    graph = build_static_graph(stations)
    save_graph(graph)
    n_st = len(graph["station_ids"])
    n_e = len(graph["edge_type"])
    print(f"[graph] {n_st} stations + {len(graph['fire_node_ids'])} fire nodes, {n_e} edges "
          f"-> {config.GRAPH_FILE}")
    return graph


if __name__ == "__main__":
    run()
