"""
selftest.py — run this BEFORE pushing to GitHub.

Proves the deployment build is correct WITHOUT needing the server running.
It loads the real model and scores a wallet whose answer we already know from
the verified blind evaluation, then compares.

    python selftest.py

The most likely thing to break in deployment is a scikit-learn version
mismatch: joblib models are version-sensitive, so a model trained under one
version and loaded under another can warn, or silently predict differently.
This script catches that by checking the number rather than trusting it.
"""
from __future__ import annotations

import sys
import warnings
from pathlib import Path

FAILED = []


def check(label, ok, detail=""):
    print(f"[{'PASS' if ok else 'FAIL'}] {label}" + (f"  -> {detail}" if detail else ""))
    if not ok:
        FAILED.append(label)
    return ok


print("=" * 70)
print("DEPLOYMENT SELF-TEST")
print("=" * 70)

HERE = Path(__file__).parent

# ── 1. files present ─────────────────────────────────────────────────────────
print("\n--- files ---")
for f in ["main.py", "predict_service.py", "graph_service.py",
          "vasp_graph_index.json", "M1_labelled_wallets_30-3.csv",
          "requirements.txt"]:
    check(f, (HERE / f).exists())
check("static/index.html", (HERE / "static" / "index.html").exists())
check("results/ folder", (HERE / "results").is_dir(),
      "copy M3's results_564 here and rename it to 'results'")

if FAILED:
    print("\nStopping: required files are missing.")
    sys.exit(1)

# ── 2. library versions ──────────────────────────────────────────────────────
print("\n--- library versions ---")
import sklearn, numpy, pandas, joblib
print(f"       scikit-learn {sklearn.__version__} | numpy {numpy.__version__} "
      f"| pandas {pandas.__version__} | joblib {joblib.__version__}")

req = (HERE / "requirements.txt").read_text()
pinned = [l.split("==")[1].strip() for l in req.splitlines()
          if l.strip().startswith("scikit-learn==")]
if pinned:
    match = pinned[0] == sklearn.__version__
    check("requirements.txt pins the sklearn version you are using", match,
          f"pinned {pinned[0]}, installed {sklearn.__version__}")
    if not match:
        print("       ^ EDIT requirements.txt to say scikit-learn==" + sklearn.__version__)
        print("         Otherwise the deployed server loads the model under a")
        print("         different version than it was trained with.")

# ── 3. model loads, and loads cleanly ────────────────────────────────────────
print("\n--- model ---")
with warnings.catch_warnings(record=True) as caught:
    warnings.simplefilter("always")
    sys.path.insert(0, str(HERE))
    import predict_service
    predict_service._load_artifacts()
    version_warnings = [w for w in caught
                        if "version" in str(w.message).lower()]

check("model artifacts load", predict_service._rf_pipeline is not None)
check("no version-mismatch warning on load", not version_warnings,
      str(version_warnings[0].message)[:90] if version_warnings else "")
feats = predict_service._feature_names
check("model expects 7 features", len(feats) == 7, str(feats))

# ── 4. the model is the 564 retrain, not the old 654 ─────────────────────────
import json
m = HERE / "results" / "classification_metrics.json"
if m.exists():
    n = json.load(open(m)).get("total_samples")
    check("trained on 564 wallets (not 654)", n == 564, f"total_samples={n}")
    if n == 654:
        print("       ^ This model memorised the 90 demo wallets. Get results_564 from M3.")

# ── 5. known-answer test ─────────────────────────────────────────────────────
# 0x0eefaf34... is a blind holdout wallet. The verified evaluation gives
# ml_score 0.9967 for Kraken. If this build reproduces that, the model, the
# feature order and the library versions are all correct.
print("\n--- known-answer test (blind holdout wallet, true label: Kraken) ---")
features = {
    "record_count": 1000.0,
    "volume_eth": 101.0,
    "avg_tx_value": 0.101,
    "std_tx_value": 3.162404117091898,
    "active_days": 271.0,
    "activity_duration_days": 385.8350347222223,
    "transactions_per_day": 3.690036900369004,
}
res = predict_service.predict_wallet_vasp(
    address="0x0eefaf34f9ccf41366ab547330c8978be8fd3ff9", features=features)
top = res["ranked_vasps"][0]
print(f"       predicted {top['name']} at ml_score {res['ml_score']}")
check("predicts Kraken", top["name"] == "Kraken", top["name"])
check("ml_score matches the verified 0.9967", abs(res["ml_score"] - 0.9967) < 0.01,
      f"got {res['ml_score']}")
check("not flagged insufficient evidence", not res["unknown_or_insufficient_evidence"])

# ── 6. graph index ───────────────────────────────────────────────────────────
print("\n--- graph index ---")
from graph_service import GraphScorer
gs = GraphScorer(str(HERE / "vasp_graph_index.json"))
check("graph index uses 564 anchors", len(gs.anchors) == 564, f"{len(gs.anchors)}")
check("counterparty index loaded", len(gs.index) > 80000, f"{len(gs.index)} entries")

# ── 7. registry ──────────────────────────────────────────────────────────────
print("\n--- registry ---")
import pandas as pd
reg = pd.read_csv(HERE / "M1_labelled_wallets_30-3.csv")
reg.columns = [c.lower() for c in reg.columns]
counts = reg["vasp"].value_counts().to_dict()
check("registry is 564 rows", len(reg) == 564, str(len(reg)))
check("registry class counts correct", counts == {"Coinbase": 311, "Kraken": 206,
                                                  "Binance": 47}, str(counts))

# ── result ───────────────────────────────────────────────────────────────────
print("\n" + "=" * 70)
if FAILED:
    print("FAILED:", ", ".join(FAILED))
    print("Fix these before pushing. Do not deploy a build that fails here.")
    sys.exit(1)

print("ALL CHECKS PASSED.")
print()
print("Next: run the server and open the UI in a browser.")
print("    uvicorn main:app --port 8000")
print("    http://localhost:8000")
print()
print("This is the exact process that runs in production, so if the browser")
print("test works here, deployment holds no surprises.")
print("=" * 70)
