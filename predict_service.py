"""
Live VASP prediction service.

This is the "simple prediction function/service returning ranked VASP
candidates and scores" your SIH blueprint asks M3 to expose. M5's
FastAPI endpoint imports `predict_wallet_vasp` and calls it once per
incoming request - it does NOT retrain anything, it just loads the
already-trained artifacts from `m3_pipeline.py` and scores one wallet.

Usage from the backend:

    from predict_service import predict_wallet_vasp

    features = {
        "record_count": 42,
        "volume_eth": 12.5,
        "avg_tx_value": 0.3,
        "std_tx_value": 1.1,
        "active_days": 9,
        "activity_duration_days": 40,
        "transactions_per_day": 4.6,
    }

    result = predict_wallet_vasp(address="0xabc...", chain="ethereum",
                                  features=features)

`result` matches the blueprint's shared `Prediction` object schema
(Section 4): address, chain, ranked_vasps, ml_score,
unknown_or_insufficient_evidence, evidence. `graph_score` and
`transaction_score` are left as None here - M5's fusion engine fills
those in from M4/the blockchain module before combining them into the
final attribution score.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import joblib
import numpy as np
import pandas as pd

# Model location, resolved in this order:
#   1. MODEL_DIR environment variable  (deployment)
#   2. ./results  beside this file     (flat container layout)
#   3. ../results one level up         (local dev layout)
import os

_HERE = Path(__file__).parent


def _resolve_model_dir() -> Path:
    env = os.getenv("MODEL_DIR")
    if env:
        return Path(env)
    if (_HERE / "results").is_dir():
        return _HERE / "results"
    return _HERE.parent / "results"


MODEL_DIR = _resolve_model_dir()
CONFIDENCE_THRESHOLD = 0.60
TOP_K = 3

_rf_pipeline = None
_label_encoder = None
_iso_forest = None
_anomaly_imputer = None
_feature_names = None
_feature_importance_rank = None


def _load_artifacts() -> None:
    """
    Load all model artifacts once and cache them at module level.

    Loading joblib files is relatively slow (tens of milliseconds) -
    doing it on every request instead of once at import time would
    add unnecessary latency to every API call.
    """
    global _rf_pipeline, _label_encoder, _iso_forest, _anomaly_imputer
    global _feature_names, _feature_importance_rank

    if _rf_pipeline is not None:
        return

    _rf_pipeline = joblib.load(MODEL_DIR / "random_forest_pipeline.joblib")
    _label_encoder = joblib.load(MODEL_DIR / "label_encoder.joblib")
    _iso_forest = joblib.load(MODEL_DIR / "isolation_forest_model.joblib")
    _anomaly_imputer = joblib.load(MODEL_DIR / "anomaly_imputer.joblib")

    _feature_names = list(_rf_pipeline.named_steps["imputer"].feature_names_in_)

    importances = _rf_pipeline.named_steps["classifier"].feature_importances_
    _feature_importance_rank = [
        name for _, name in sorted(zip(importances, _feature_names), reverse=True)
    ]


def _build_feature_row(features: dict) -> pd.DataFrame:
    """
    Turn a raw feature dict from M1/M2's live pipeline into a single-row
    DataFrame with the exact column order the trained model expects.

    Missing keys become NaN (the model's own median imputer, already
    fitted on training data, will fill them in) rather than raising -
    a live wallet may legitimately be missing a feature M1 couldn't
    compute yet.
    """
    row = {name: features.get(name, np.nan) for name in _feature_names}
    return pd.DataFrame([row], columns=_feature_names)


def predict_wallet_vasp(
    address: str,
    features: dict,
    chain: str = "ethereum",
) -> dict:
    """
    Score a single wallet and return a blueprint-schema Prediction object.

    Parameters
    ----------
    address : the wallet address being investigated.
    features : dict of the 7 model features (see module docstring).
               Extra keys are ignored; missing keys are imputed.
    chain : blockchain name, passed through unchanged.

    Returns
    -------
    dict matching the shared Prediction schema.
    """
    _load_artifacts()

    X = _build_feature_row(features)

    proba = _rf_pipeline.predict_proba(X)[0]
    class_names = _label_encoder.classes_
    n_classes = len(class_names)
    k = min(TOP_K, n_classes)

    top_k_idx = np.argsort(-proba)[:k]
    ranked_vasps = [
        {"name": str(class_names[i]), "score": round(float(proba[i]), 4)}
        for i in top_k_idx
    ]

    ml_score = float(proba.max())

    # No usable signal at all in any feature -> can't have gotten this
    # far with real evidence, regardless of what the classifier guesses.
    raw_values = np.array([features.get(name, 0) or 0 for name in _feature_names], dtype=float)
    no_signal = bool(np.nansum(np.abs(raw_values)) == 0)

    unknown_or_insufficient_evidence = no_signal or (ml_score < CONFIDENCE_THRESHOLD)

    # Anomaly check (same imputer/model used at training time).
    X_imputed = _anomaly_imputer.transform(X)
    is_anomaly = bool(_iso_forest.predict(X_imputed)[0] == -1) or no_signal
    anomaly_score = float(_iso_forest.decision_function(X_imputed)[0])

    # Lightweight, transparent evidence: which globally-important
    # features this wallet's raw values came from. This is NOT a
    # per-wallet causal explanation (that would need SHAP) - it is
    # deliberately simple and honest about what it is, matching the
    # blueprint's "score + evidence, not proof" framing (Section 15).
    evidence = []
    for name in _feature_importance_rank[:3]:
        value = features.get(name)
        if value is not None:
            evidence.append(f"{name} = {value} (top global feature for this model)")

    return {
        "address": address,
        "chain": chain,
        "ranked_vasps": ranked_vasps,
        "ml_score": round(ml_score, 4),
        "graph_score": None,  # filled in by M4 in the fusion engine
        "transaction_score": None,  # filled in by M1/M5
        "anomaly_score": round(anomaly_score, 4),
        "is_anomaly": is_anomaly,
        "evidence": evidence,
        "unknown_or_insufficient_evidence": unknown_or_insufficient_evidence,
    }


if __name__ == "__main__":
    # Quick manual smoke test - not part of the API surface.
    import json

    example = {
        "record_count": 1000,
        "volume_eth": 500.0,
        "avg_tx_value": 0.5,
        "std_tx_value": 15.8,
        "active_days": 40,
        "activity_duration_days": 40.7,
        "transactions_per_day": 25.0,
    }
    result = predict_wallet_vasp(address="0xexample", features=example)
    print(json.dumps(result, indent=2))
