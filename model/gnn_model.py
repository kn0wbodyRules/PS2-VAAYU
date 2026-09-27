"""VAAYU coupled spatiotemporal GNN.

    baseline (CAMS chem + met, or Open-Meteo met)  ─────────────────────────────┐
                                                                                 + ─> forecast
    [state, mask, baseline, physics(state), exog] ─> encoder ─> GATv2 over the   │
    dynamic wind graph (stations + fire nodes) ─> GRU (per station) ─> shared    │
    trunk ─┬─> chemistry head ─> residual on CAMS  (pm25, pm10, o3, no2) ────────┤
           └─> meteorology head ─> residual on met baseline (t2m, u10, v10, blh) ┘

Coupling: both heads read one shared trunk, and the rollout feeds the combined
(chem + met) forecast back in hour by hour for 72 h. The next step's ventilation
coefficient, stagnation index and graph edge weights are recomputed from the model's
*own predicted* wind and BLH, so a met change moves chemistry and vice versa.

Training uses teacher forcing -> scheduled sampling (tf_prob), see train.py.
"""

from __future__ import annotations

import torch
from torch import nn
from torch_geometric.nn import GATv2Conv

import config
from graph.build_graph import FIRE_EDGE, edge_weights
from preprocessing.features import stagnation_index, ventilation_coefficient, wind_speed

N_STATE = len(config.STATE_VARS)
N_CHEM = len(config.CHEM_VARS)
I_U, I_V, I_BLH = (config.STATE_VARS.index(v) for v in ("u10", "v10", "blh"))


def mlp(i, h, o, depth=2):
    layers, d = [], i
    for _ in range(depth - 1):
        layers += [nn.Linear(d, h), nn.GELU()]
        d = h
    return nn.Sequential(*layers, nn.Linear(d, o))


class VaayuGNN(nn.Module):
    def __init__(self, graph: dict, norm: dict, n_exog: int, n_fire_feat: int = 2,
                 hidden: int = 64, gat_heads: int = 2):
        super().__init__()
        self.hparams = {"n_exog": n_exog, "n_fire_feat": n_fire_feat, "hidden": hidden,
                        "gat_heads": gat_heads}
        self.n_st = len(graph["station_ids"])
        self.n_nodes = self.n_st + len(graph["fire_node_ids"])
        self.hidden = hidden

        self.register_buffer("edge_index", torch.tensor(graph["edge_index"], dtype=torch.long))
        for k in ("sin_b", "cos_b", "decay"):
            self.register_buffer(k, torch.tensor(graph[k], dtype=torch.float32))
        self.register_buffer("is_fire", (torch.tensor(graph["edge_type"]) == FIRE_EDGE).float())
        self.register_buffer("wind_node", torch.tensor(graph["wind_node"], dtype=torch.long))
        self.register_buffer("state_mean", torch.tensor(norm["state_mean"], dtype=torch.float32))
        self.register_buffer("state_std", torch.tensor(norm["state_std"], dtype=torch.float32))

        step_in = N_STATE * 3 + 2 + n_exog  # state, mask, baseline, physics(2), exog
        self.station_enc = mlp(step_in, hidden, hidden)
        self.fire_enc = mlp(n_fire_feat, hidden, hidden)
        self.gat = GATv2Conv(hidden, hidden // gat_heads, heads=gat_heads, edge_dim=2,
                             add_self_loops=True)
        self.gru = nn.GRUCell(2 * hidden, hidden)
        # heads also see the target hour's baseline + known exogenous features
        self.trunk = mlp(hidden + N_STATE + n_exog, hidden, hidden)
        self.chem_head = mlp(hidden, hidden, N_CHEM)
        self.met_head = mlp(hidden, hidden, N_STATE - N_CHEM)
        self._ei_cache: dict = {}

    # ------------------------------------------------------------------
    def denorm(self, x):
        return x * self.state_std + self.state_mean

    def physics(self, state_n):
        """Ventilation + stagnation recomputed from the (possibly predicted) state."""
        s = self.denorm(state_n)
        ws = wind_speed(s[..., I_U], s[..., I_V])
        vc = ventilation_coefficient(ws, s[..., I_BLH].clamp(min=10.0))
        return torch.stack([torch.log1p(vc.clamp(min=0)) / 10.0, stagnation_index(vc)], -1), s

    def _batched_edges(self, b: int):
        key = (b, self.edge_index.device)
        if key not in self._ei_cache:
            offs = torch.arange(b, device=self.edge_index.device).repeat_interleave(
                self.edge_index.shape[1]) * self.n_nodes
            self._ei_cache = {key: self.edge_index.repeat(1, b) + offs}
        return self._ei_cache[key]

    def step(self, h, state_n, mask, base_n, exog, fire_feat):
        """Ingest one hour of information and update the per-station hidden state."""
        b = state_n.shape[0]
        phys, s = self.physics(state_n)
        xs = self.station_enc(torch.cat([state_n, mask, base_n, phys, exog], -1))   # (B,N,H)
        xf = self.fire_enc(fire_feat)                                                # (B,F,H)
        x = torch.cat([xs, xf], 1).reshape(b * self.n_nodes, self.hidden)

        u, v = s[..., I_U][:, self.wind_node], s[..., I_V][:, self.wind_node]        # (B,E)
        w = edge_weights(u, v, self.sin_b, self.cos_b, self.decay, self.is_fire)
        edge_attr = torch.stack([w, torch.log(w + 1e-3)], -1).reshape(-1, 2)
        spatial = self.gat(x, self._batched_edges(b), edge_attr)
        spatial = spatial.reshape(b, self.n_nodes, self.hidden)[:, :self.n_st]

        h = self.gru(torch.cat([xs, spatial], -1).reshape(-1, 2 * self.hidden),
                     h.reshape(-1, self.hidden))
        return h.reshape(b, self.n_st, self.hidden)

    def heads(self, h, base_next, exog_next):
        z = self.trunk(torch.cat([h, base_next, exog_next], -1))
        return torch.cat([self.chem_head(z), self.met_head(z)], -1)  # normalised residuals

    # ------------------------------------------------------------------
    def forward(self, batch: dict, horizon: int | None = None, tf_prob: float = 0.0):
        """Autoregressive rollout. Returns normalised absolute forecasts (B, K, N, 8).

        tf_prob: probability (per sample and station, per hour) of feeding the observed
        truth instead of the model's own forecast into the next step. 1.0 = teacher forcing,
        0.0 = free-running (inference). Unobserved truth always falls back to the forecast.
        """
        hs, hm, hb, he, hf = (batch[k] for k in ("hist_state", "hist_mask", "hist_base",
                                                  "hist_exog", "hist_fire"))
        fb, fe, ff = batch["fut_base"], batch["fut_exog"], batch["fut_fire"]
        b, n_hist = hs.shape[:2]
        horizon = horizon or fb.shape[1]

        h = hs.new_zeros(b, self.n_st, self.hidden)
        for t in range(n_hist):
            h = self.step(h, hs[:, t], hm[:, t], hb[:, t], he[:, t], hf[:, t])

        preds = []
        for k in range(horizon):
            pred = fb[:, k] + self.heads(h, fb[:, k], fe[:, k])
            preds.append(pred)
            if k == horizon - 1:
                break
            nxt, m = pred, torch.zeros_like(pred)
            if tf_prob > 0 and "target" in batch:
                avail = batch["target_mask"][:, k] > 0
                pick = torch.rand(b, self.n_st, 1, device=pred.device) < tf_prob
                use = avail & pick
                nxt = torch.where(use, batch["target"][:, k], pred)
                m = use.float()
            h = self.step(h, nxt, m, fb[:, k], fe[:, k], ff[:, k])
        return torch.stack(preds, 1)


def build_model(graph: dict, norm: dict, hparams: dict) -> VaayuGNN:
    return VaayuGNN(graph, norm, n_exog=hparams["n_exog"],
                    n_fire_feat=hparams.get("n_fire_feat", 2),
                    hidden=hparams.get("hidden", 64), gat_heads=hparams.get("gat_heads", 2))


def load_checkpoint(path, device="cpu"):
    """Rebuild a model from a checkpoint written by train.save_checkpoint."""
    ckpt = torch.load(path, map_location=device, weights_only=False)
    model = build_model(ckpt["graph"], ckpt["norm"], ckpt["hparams"])
    model.load_state_dict(ckpt["model_state"])
    return model.to(device).eval(), ckpt
