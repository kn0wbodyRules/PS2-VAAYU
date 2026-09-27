"""End-to-end on synthetic data, CPU only: raw -> processed -> graph -> train -> evaluate
-> promote -> FastAPI. Everything is written under the temporary VAAYU_DRIVE_ROOT."""

import json

import numpy as np
import pandas as pd
import pytest
import torch

import config
from tests import synthetic


@pytest.fixture(scope="module")
def pipeline_env():
    mp = pytest.MonkeyPatch()
    mp.setattr(config, "TRAIN_RANGES", [("2023-01-01", "2023-01-31 23:00")])
    mp.setattr(config, "BENCHMARK_RANGE", ("2023-01-15", "2023-01-20 23:00"))
    mp.setattr(config, "VAL_RANGE", ("2023-02-01", "2023-02-08 23:00"))
    mp.setattr(config, "TEST_RANGE", ("2023-02-09", "2023-02-19 23:00"))
    from preprocessing import clean_align
    mp.setattr(clean_align, "MIN_OVERLAP_HOURS", 24 * 7)
    synthetic.make_raw("2023-01-01", days=50)
    yield
    mp.undo()


def test_end_to_end(pipeline_env):
    from graph import build_graph
    from model import evaluate, promote, train
    from preprocessing import clean_align, features

    # ---- preprocessing
    obs = clean_align.run()
    assert set(config.CHEM_VARS) <= set(obs.columns)
    assert obs.groupby("station_id").size().nunique() == 1           # one shared hourly clock
    assert (obs["pm25_flag"] == 1).any() and (obs["pm25_flag"] == 2).any()
    assert (obs[config.CHEM_VARS].dropna() > 0).all().all()           # never zero-filled
    cams = pd.read_parquet(config.CAMS_STATION_FILE)
    assert {"issue_time", "lead_hour", "valid_time", "no2", "o3", "blh"} <= set(cams.columns)
    assert cams["pm25"].between(1, 1000).all()                         # kg/m3 -> ug/m3
    assert cams["no2"].between(30, 40).all()                           # kg/kg -> ug/m3 via rho
    assert cams["t2m"].between(-10, 40).all()                          # K -> degC

    feats = features.run()
    for c in ("ventilation_coef", "stagnation_index", "fire_influence_score",
              "cams_res_pm25", "met_res_blh", "stubble_season"):
        assert c in feats
    assert feats["fire_influence_score"].max() > 0

    graph = build_graph.run()
    assert len(graph["fire_node_ids"]) > 0

    # ---- dataset / splits
    data = train.load_data()
    tr, bm = data.split("train"), data.split("benchmark")
    assert len(tr) > 0 and len(bm) > 0 and len(data.split("test")) > 0
    b0, b1 = (pd.Timestamp(t, tz="UTC") for t in config.BENCHMARK_RANGE)
    for i0, _ in tr:  # benchmark slice purged from training windows
        w0, w1 = data.times[i0 - data.history + 1], data.times[i0 + data.horizon]
        assert w1 < b0 or w0 > b1

    # ---- training (tiny)
    cfg = {"hidden": 16, "gat_heads": 2, "epochs": 3, "batch_size": 4, "checkpoint_every": 1,
           "teacher_forcing_epochs": 1, "sampling_ramp_epochs": 1, "horizon_start": 24}
    run_dir = train.run(cfg, data=data, run_id="test_run")
    assert (run_dir / "best.pt").exists() and (run_dir / "epoch_001.pt").exists()
    log = json.loads((config.LOGS / "train_test_run.json").read_text())
    assert [h["tf_prob"] for h in log["history"]] == [1.0, 0.0, 0.0]
    assert log["history"][0]["horizon"] == 24 and log["history"][-1]["horizon"] == 72

    # ---- evaluation
    metrics, mpath = evaluate.run(run_dir / "best.pt", data=data, device="cpu")
    test = metrics["splits"]["test"]
    assert test["errors"]["pm25"]["lead_72h"]["baseline"]["rmse"] is not None
    assert "rmse_improvement_pct" in test["errors"]["no2"]["day3"]
    assert test["categories"]["day2"]["model"]["category_accuracy"] is not None
    assert "severe" in test["categories"]["day3"]["model"]["extreme"]
    assert isinstance(test["perturbation_test"]["passed"], bool)
    assert "jena_comparison" in metrics["splits"]["benchmark"]
    assert metrics["score"] is not None and mpath.name.startswith("metrics_")

    # ---- promotion: first model promotes, an identical one does not
    assert promote.run(run_dir / "best.pt", mpath) is True
    assert config.PRODUCTION_MODEL_FILE.exists()
    assert promote.run(run_dir / "best.pt", mpath) is False
    reg = json.loads(config.REGISTRY_FILE.read_text())
    assert reg["production"]["run_id"] == "test_run" and len(reg["history"]) == 2

    # ---- backend
    from fastapi.testclient import TestClient
    from backend.main import app
    client = TestClient(app)
    assert client.get("/health").json()["model_present"] is True
    assert client.get("/model").json()["run_id"] == "test_run"
    r = client.get("/forecast", params={"station_id": "ito", "hours": 72})
    assert r.status_code == 200, r.text
    fc = r.json()["forecast"]
    assert len(fc) == 72 and {"pm25", "blh", "cams_pm25", "aqi", "category",
                              "stagnation_index"} <= set(fc[0])
    assert client.get("/forecast", params={"station_id": "nope"}).status_code == 404

    fires = client.get("/fires", params={"hours": 240}).json()
    assert fires["count"] == len(fires["fires"]) and {"lat", "lon", "timestamp", "frp"} <= set(fires["fires"][0])
    al = client.get("/alerts", params={"min_category": "moderate"}).json()
    assert isinstance(al["alerts"], list)
    for a in al["alerts"]:
        assert a["worst_category"] in ("moderate", "poor", "very_poor", "severe") and 1 <= a["first_lead_hour"] <= 72
    cors = client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert cors.headers.get("access-control-allow-origin") in ("*", "http://localhost:5173")


def test_met_change_propagates_to_later_chemistry():
    """A wind change in hour 1 of the met forecast must reach chemistry at later hours:
    the rollout feeds predicted met back in (edges, ventilation, stagnation)."""
    from graph.build_graph import build_static_graph
    from model.dataset import EXOG_FEATURES
    from model.gnn_model import build_model

    torch.manual_seed(0)
    g = build_static_graph(synthetic.STATIONS)
    norm = {"state_mean": [0.0] * 8, "state_std": [1.0] * 8}
    m = build_model(g, norm, {"n_exog": len(EXOG_FEATURES), "hidden": 8, "gat_heads": 2}).eval()
    N, F, H, K, E = len(synthetic.STATIONS), len(g["fire_node_ids"]), 4, 6, len(EXOG_FEATURES)
    batch = {"hist_state": torch.randn(1, H, N, 8), "hist_mask": torch.ones(1, H, N, 8),
             "hist_base": torch.randn(1, H, N, 8), "hist_exog": torch.randn(1, H, N, E),
             "hist_fire": torch.randn(1, H, F, 2), "fut_base": torch.randn(1, K, N, 8),
             "fut_exog": torch.randn(1, K, N, E), "fut_fire": torch.randn(1, K, F, 2)}
    with torch.no_grad():
        a = m(batch)
        batch["fut_base"][:, 0, :, 5] += 5.0  # stronger u-wind in the first forecast hour
        b = m(batch)
    assert a.shape == (1, K, N, 8)
    assert not torch.allclose(a[:, 0, :, 5], b[:, 0, :, 5])     # hour-1 wind forecast moved
    assert not torch.allclose(a[:, 2:, :, :4], b[:, 2:, :, :4]) # ...and later chemistry followed
