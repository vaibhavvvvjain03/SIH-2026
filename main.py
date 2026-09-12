import os
import json
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
from typing import List, Optional
import pandas as pd
import httpx
from pathlib import Path

from predict_service import predict_wallet_vasp

app = FastAPI(title="SIH 2026 - VASP Attribution Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ETHERSCAN_API_KEY = os.getenv("ETHERSCAN_API_KEY", "KN725A7HJJF1H1IRJME7FNK5SZZUX5KHN2")

# ── TRAIN / SERVE PARITY ─────────────────────────────────────────────────────
# Verified against M1's raw_transactions.csv: 367 of 624 wallets are capped at
# exactly 1000 transactions, max = 1000. M2 aggregated over that full history.
# Serving features from only the last 20 transactions puts them 4-6 orders of
# magnitude away from anything the model saw in training.
FEATURE_TX_LIMIT = 1000
DISPLAY_TX_LIMIT = 20

# ── FUSION WEIGHTS (blueprint Section 7) ─────────────────────────────────────
W_ML = 0.40
W_GRAPH = 0.30
W_TX = 0.20
W_KNOWN_ADDR = 0.10

# ── WHY THE WEIGHTS ARE RENORMALISED AT RUNTIME ──────────────────────────────
# transaction_score is defined as avg_tx_value / volume_eth. Algebraically that
# is (sum/n)/sum = 1/n, i.e. the inverse transaction count - NOT a behavioural
# signal. Every 1000-transaction wallet scores exactly 0.001, so the 20% weight
# contributes ~0 and actively penalises busy wallets.
#
# Left as-is, a wallet where ML says 0.9967 and the graph says 0.972 - near
# total agreement - reports a headline fused score of 0.69, while a trivial
# registry lookup reports 0.99. The strongest inference looks weaker than the
# simplest one.
#
# Fix: fuse only over the components that actually carry information for this
# wallet, renormalising their weights to sum to 1. The blueprint's relative
# weighting (ML : graph = 40 : 30) is preserved exactly; only the dead term is
# excluded. Raw component scores are still returned unchanged in the response,
# so nothing is hidden and the arithmetic stays auditable.
#
# A component counts as informative when it is not None and not ~0.
MIN_INFORMATIVE = 1e-3

BASE_DIR = Path(__file__).parent
LABELLED_WALLETS_PATH = os.getenv(
    "LABELLED_WALLETS_CSV", str(BASE_DIR / "M1_labelled_wallets_30-3.csv"))
try:
    vasp_df = pd.read_csv(LABELLED_WALLETS_PATH)
    vasp_df.columns = [c.lower() for c in vasp_df.columns]
    vasp_df["wallet_address"] = vasp_df["wallet_address"].astype(str).str.lower().str.strip()
    print(f"[startup] Loaded {len(vasp_df)} labelled wallets.")
except Exception as e:
    vasp_df = pd.DataFrame()
    print(f"[startup] WARNING: labelled wallets CSV not loaded ({e}). 0-hop matching DISABLED.")

# ── M4 graph scoring ─────────────────────────────────────────────────────────
# Preferred: live per-VASP scorer (works on wallets never seen before).
# Fallback: the older static per-address evidence file.
graph_scorer = None
try:
    from graph_service import GraphScorer
    graph_scorer = GraphScorer(str(BASE_DIR / "vasp_graph_index.json"))
    print(f"[startup] Per-VASP graph scorer ready ({len(graph_scorer.index)} indexed counterparties).")
except Exception as e:
    print(f"[startup] INFO: per-VASP graph scorer unavailable ({e}).")

try:
    with open(BASE_DIR / "full_graph_evidence.json", "r") as f:
        graph_db = {k.lower(): v for k, v in json.load(f).items()}
    print(f"[startup] Loaded static graph evidence for {len(graph_db)} addresses.")
except Exception:
    graph_db = {}
    print("[startup] INFO: full_graph_evidence.json not found.")


class VaspRank(BaseModel):
    name: str
    score: float
    ml_score: Optional[float] = None
    graph_support: Optional[bool] = None


class AttributionResponse(BaseModel):
    address: str
    chain: str
    ranked_vasps: List[VaspRank]
    ml_score: float
    graph_score: Optional[float] = None
    graph_nearest_vasp: Optional[str] = None
    transaction_score: Optional[float] = None
    fused_score: Optional[float] = None
    fusion_weights_applied: Optional[dict] = None
    ml_graph_agreement: Optional[bool] = None
    anomaly_score: Optional[float] = None
    is_anomaly: Optional[bool] = None
    transactions_analysed: Optional[int] = None
    # model_features: the exact values M2 computed over up to 1000 tx — the
    # numbers the classifier actually saw. The frontend must display these
    # (not recompute from the 20 display transactions) so every panel shows
    # the same numbers the accuracy claims rest on.
    model_features: Optional[dict] = None
    evidence: List[str]
    unknown_or_insufficient_evidence: bool


class TransactionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    tx_hash: str
    chain: str
    block_number: int
    timestamp: str
    from_address: str = Field(..., alias="from")
    to: str
    value: float
    token: str
    token_address: Optional[str] = None


async def fetch_transactions(address: str, chain: str, limit: int) -> List[dict]:
    """Fetch up to `limit` real transactions. Returns [] on failure - never fake data."""
    url = "https://api.etherscan.io/v2/api"
    params = {
        "chainid": "1", "module": "account", "action": "txlist",
        "address": address, "startblock": 0, "endblock": 99999999,
        # sort=asc is REQUIRED for train/serve parity. M1's collection script
        # (Script_For_raw_transactions.py) used sort="asc", so every training
        # feature was computed from each wallet's OLDEST 1000 transactions.
        # Fetching "desc" here would score live wallets on their NEWEST
        # activity - e.g. the Binance hot wallet trained on Aug-2017 data would
        # be judged on 2026 data. Different distribution, meaningless result.
        "page": 1, "offset": limit, "sort": "asc", "apikey": ETHERSCAN_API_KEY,
    }
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(url, params=params, timeout=25.0)
            data = resp.json()
            if data.get("status") == "1" and isinstance(data.get("result"), list):
                return [{
                    "tx_hash": tx.get("hash", ""),
                    "chain": chain,
                    "block_number": int(tx.get("blockNumber", 0)),
                    "timestamp": pd.to_datetime(int(tx.get("timeStamp", 0)), unit="s").isoformat(),
                    "from": (tx.get("from") or "").lower(),
                    "to": (tx.get("to") or "").lower(),
                    "value": float(tx.get("value", 0)) / 1e18,
                    "token": "ETH",
                    "token_address": None,
                    "is_error": tx.get("isError", "0"),
                } for tx in data["result"][:limit]]
        except Exception as exc:
            print(f"[fetch] Etherscan failed for {address}: {exc}")
    return []


def build_features(txs: List[dict]) -> dict:
    """
    Replicates M2's feature_generation.py aggregation EXACTLY.

    Verified against M2 source and cross-checked numerically on the whole
    training set. Note the two formulas that are easy to get wrong:

      activity_duration_days = (max - min) total seconds / 86400
      transactions_per_day   = unique_tx_count / active_days      <-- NOT
                               record_count / activity_duration_days

    Using the wrong transactions_per_day formula on the Binance hot wallet
    gives 168.27 instead of the trained 142.86.
    """
    df = pd.DataFrame(txs)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df["value"] = pd.to_numeric(df["value"], errors="coerce").fillna(0.0)

    span_days = (df["timestamp"].max() - df["timestamp"].min()).total_seconds() / 86400.0
    active_days = int(df["timestamp"].dt.date.nunique())
    unique_tx_count = int(df["tx_hash"].nunique())

    return {
        "record_count": float(len(df)),
        "volume_eth": float(df["value"].sum()),
        "avg_tx_value": float(df["value"].mean()),
        "std_tx_value": float(df["value"].std()) if len(df) > 1 else 0.0,
        "active_days": float(active_days),
        "activity_duration_days": float(span_days) if span_days > 0 else 0.0,
        "transactions_per_day": float(unique_tx_count / active_days) if active_days > 0 else 0.0,
    }


def compute_transaction_score(features: dict) -> float:
    vol, avg = features.get("volume_eth", 0.0), features.get("avg_tx_value", 0.0)
    if vol <= 0 or avg <= 0:
        return 0.0
    return round(float(min(1.0, max(0.0, avg / (vol + 1e-6)))), 4)


def fuse_per_candidate(ranked_vasps, graph_score, graph_nearest, tx_score, known_hit,
                       graph_vector=None):
    """
    VASP-AWARE FUSION.

    The previous version added M4's confidence-in-VASP-A to M3's
    confidence-in-VASP-B and reported the sum as a single number. Measured on
    the labelled set, ML top-1 and graph nearest_vasp disagree on 13.9% of
    wallets, so that arithmetic was inflating confidence in a candidate the
    graph did not actually support.

    Here graph evidence is credited ONLY to the candidate it names. Every
    candidate is scored independently and the list is re-ranked on the fused
    value, so the graph can genuinely change the answer instead of adding a
    constant offset to whatever the ML happened to pick.
    """
    # Decide ONCE, for this wallet, which components carry information.
    # The same weight set is then used for every candidate, so candidates
    # remain directly comparable to each other.
    graph_informative = (
        graph_vector is not None
        or (graph_score is not None and graph_score > MIN_INFORMATIVE)
    )
    tx_informative = tx_score is not None and tx_score > MIN_INFORMATIVE

    weights = {"ml": W_ML}
    if graph_informative:
        weights["graph"] = W_GRAPH
    if tx_informative:
        weights["tx"] = W_TX
    if known_hit:
        weights["known"] = W_KNOWN_ADDR

    total_w = sum(weights.values()) or 1.0
    w_ml = weights["ml"] / total_w
    w_graph = weights.get("graph", 0.0) / total_w
    w_tx = weights.get("tx", 0.0) / total_w
    w_known = weights.get("known", 0.0) / total_w

    fused_list = []
    for cand in ranked_vasps:
        name = cand["name"]
        supported = (graph_nearest is not None and name == graph_nearest)
        if graph_vector is not None:
            # Per-VASP scores: every candidate gets the graph's own opinion of it,
            # so the graph can promote a candidate the ML ranked second.
            g = float(graph_vector.get(name, 0.0))
        else:
            g = graph_score if supported else 0.0

        fused = (w_ml * float(cand["score"])) + (w_graph * g) + (w_tx * tx_score) \
                + (w_known * (1.0 if known_hit else 0.0))

        fused_list.append({
            "name": name,
            "score": round(float(min(1.0, max(0.0, fused))), 4),
            "ml_score": round(float(cand["score"]), 4),
            "graph_support": supported,
        })

    fused_list.sort(key=lambda x: x["score"], reverse=True)
    return fused_list, {k: round(v, 4) for k, v in
                        {"ml": w_ml, "graph": w_graph,
                         "tx": w_tx, "known_address": w_known}.items() if v > 0}


@app.get("/transactions", response_model=List[TransactionResponse])
async def get_transactions(address: str = Query(...), chain: str = Query(...)):
    return await fetch_transactions(address, chain.lower(), DISPLAY_TX_LIMIT)


@app.get("/attribution", response_model=AttributionResponse)
async def get_attribution(address: str = Query(...), chain: str = Query(...)):
    addr = address.lower().strip()
    chain = chain.lower()

    # ── 1. Direct 0-hop registry match ───────────────────────────────────────
    if not vasp_df.empty and "wallet_address" in vasp_df.columns:
        m = vasp_df[vasp_df["wallet_address"] == addr]
        if not m.empty:
            col = "vasp" if "vasp" in m.columns else m.columns[1]
            name = str(m.iloc[0][col]).strip()
            ev = [
                f"Direct 0-hop match in verified VASP registry: {name}.",
                "Address is a known, labelled VASP-controlled wallet - highest confidence tier.",
            ]
            if addr in graph_db:
                ev.extend(graph_db[addr].get("evidence", []))
            return {
                "address": address, "chain": chain,
                "ranked_vasps": [{"name": name, "score": 0.99, "ml_score": None, "graph_support": True}],
                "ml_score": 0.99, "graph_score": 0.99, "graph_nearest_vasp": name,
                "transaction_score": 0.99, "fused_score": 0.99, "ml_graph_agreement": None,
                "anomaly_score": 0.0, "is_anomaly": False, "transactions_analysed": None,
                "evidence": ev, "unknown_or_insufficient_evidence": False,
            }

    # ── 2. Deep fetch for feature parity ─────────────────────────────────────
    txs = await fetch_transactions(address, chain, FEATURE_TX_LIMIT)
    if len(txs) < 2:
        return {
            "address": address, "chain": chain, "ranked_vasps": [],
            "ml_score": 0.0, "graph_score": None, "graph_nearest_vasp": None,
            "transaction_score": 0.0, "fused_score": 0.0, "ml_graph_agreement": None,
            "anomaly_score": 0.0, "is_anomaly": False, "transactions_analysed": len(txs),
            "evidence": [
                "Live transaction data unavailable or insufficient on-chain activity.",
                "Refusing to attribute a VASP without behavioural evidence.",
            ],
            "unknown_or_insufficient_evidence": True,
        }

    features = build_features(txs)

    # ── 3. ML prediction ─────────────────────────────────────────────────────
    result = predict_wallet_vasp(address=address, chain=chain, features=features)
    result["transactions_analysed"] = len(txs)
    # Expose the model's own feature values so the frontend can show the
    # same numbers the classifier saw (computed over all fetched tx) rather
    # than recomputing from only the 20 display transactions.
    result["model_features"] = {
        "active_days": round(features.get("active_days", 0), 0),
        "transactions_per_day": round(features.get("transactions_per_day", 0), 2),
        "volume_eth": round(features.get("volume_eth", 0), 4),
        "avg_tx_value": round(features.get("avg_tx_value", 0), 4),
        "std_tx_value": round(features.get("std_tx_value", 0), 4),
        "activity_duration_days": round(features.get("activity_duration_days", 0), 1),
    }

    if result.get("unknown_or_insufficient_evidence"):
        result.update({"fused_score": 0.0, "transaction_score": 0.0,
                       "graph_score": None, "graph_nearest_vasp": None,
                       "ml_graph_agreement": None})
        return result

    ml_score = float(result.get("ml_score", 0.0))

    # ── 4. Graph evidence ────────────────────────────────────────────────────
    # Preferred path: per-VASP scores computed live from the transactions we
    # already fetched. Gives a real per-candidate signal instead of one scalar.
    graph_vector = None
    if graph_scorer is not None:
        gv = graph_scorer.score(addr, txs)
        if gv.get("top"):
            graph_vector = gv["scores"]
            graph_score = float(gv["graph_score"])
            graph_nearest = gv["top"]
            result["evidence"].extend(gv["evidence"])

    if graph_vector is not None:
        pass
    elif addr in graph_db:
        gd = graph_db[addr]
        graph_score = float(gd.get("graph_score", 0.0))
        graph_nearest = gd.get("nearest_vasp")
        result["evidence"].extend(gd.get("evidence", []))
    else:
        graph_score, graph_nearest = 0.0, None
        result["evidence"].append("No graph topology data found for this wallet.")

    tx_score = compute_transaction_score(features)

    # ── 5. VASP-aware fusion + re-rank ───────────────────────────────────────
    ranked = result.get("ranked_vasps", [])
    fused_ranked, applied_weights = fuse_per_candidate(
        ranked, graph_score, graph_nearest, tx_score, False,
        graph_vector=graph_vector)

    ml_top = ranked[0]["name"] if ranked else None
    agreement = (graph_nearest == ml_top) if (graph_nearest and ml_top) else None
    if agreement is False:
        result["evidence"].append(
            f"NOTE: behavioural model favours {ml_top} while graph topology points to "
            f"{graph_nearest}. Candidates re-ranked on combined evidence; treat with caution."
        )

    result["ranked_vasps"] = fused_ranked
    result["graph_score"] = round(graph_score, 4)
    result["graph_nearest_vasp"] = graph_nearest
    result["transaction_score"] = tx_score
    result["fused_score"] = fused_ranked[0]["score"] if fused_ranked else 0.0
    result["fusion_weights_applied"] = applied_weights
    result["ml_graph_agreement"] = agreement
    return result


# ── SERVE THE FRONTEND FROM THE SAME APP ─────────────────────────────────────
# Everything lives behind one URL:
#     https://<host>/                 -> investigator dashboard
#     https://<host>/attribution?...  -> API
#     https://<host>/docs             -> interactive API docs
#
# This must be mounted LAST. A mount at "/" catches every path that did not
# already match an API route above, so declaring it earlier would swallow
# /attribution and /transactions.
#
# Because the UI and the API are now the same origin, the frontend can call
# the API with a relative URL and CORS stops mattering entirely.
_STATIC = BASE_DIR / "static"
if _STATIC.is_dir():
    app.mount("/", StaticFiles(directory=str(_STATIC), html=True), name="frontend")
    print(f"[startup] Serving frontend from {_STATIC}")
else:
    print("[startup] INFO: no static/ folder - API only, no UI.")
