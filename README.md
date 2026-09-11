# Automated VASP Attribution — SIH 2026

**Problem Statement SIH26182 · Ministry of Home Affairs · Blockchain & Cybersecurity**

Given a suspect Ethereum wallet, return a **ranked list of likely Virtual Asset
Service Providers** with a confidence score, a human-readable evidence trail, and
an explicit *insufficient evidence* state when the system should not commit.

---

## Live

    https://<your-render-url>/          investigator dashboard
    https://<your-render-url>/docs      interactive API documentation

One service serves both the UI and the API, so there is no CORS configuration
and no separate frontend deployment.

## Run locally

    pip install -r requirements.txt
    python selftest.py            # verifies the build before you trust it
    uvicorn main:app --port 8000

Open <http://localhost:8000>.

---

## Results

Measured on **90 wallets held out before training and never seen by the model**.
Predictions were committed to version control *before* the ground-truth labels
were obtained, so the blind test is verifiable rather than asserted.

| Metric | Value |
|---|---|
| Cross-validated accuracy (564 training wallets) | 84.22% |
| Blind top-1 accuracy (90 unseen wallets) | **88.89%** |
| Accuracy on committed predictions | **96.05%** |
| Top-3 accuracy | 100% |
| Declined as insufficient evidence | 15.6% |
| Graph module, blind top-1 | 96.3% |

**Known weakness, stated openly:** Binance has 47 training samples against 311
for Coinbase. Its cross-validated precision is about 0.50. This is a data-volume
problem, not a modelling one, and it is why the system reports top-3 candidates
and an explicit uncertainty state rather than forcing a single answer.

---

## How it works

    Suspect wallet
         |
         v
    Etherscan collection  (up to 1000 tx, oldest-first, matching training)
         |
         +--> Behavioural ML       Random Forest over 7 wallet-level features
         |
         +--> Transaction graph    per-VASP counterparty overlap, 564 anchors
         |
         v
    Evidence fusion  (weights renormalised over informative signals)
         |
         v
    Ranked VASPs + evidence + uncertainty

Attribution is **probabilistic**. A VASP-controlled address may serve many users,
and clustering is not ownership. The interface says "likely", "evidence" and
"score" — never "owner".

---

## Repository layout

    /                      the deployable application (this is what Render runs)
      main.py                  API + static mount + evidence fusion
      predict_service.py       ML prediction service
      graph_service.py         per-VASP graph scoring
      vasp_graph_index.json    564-anchor counterparty index
      M1_labelled_wallets_30-3.csv   564-wallet registry, holdout excluded
      results/                 trained model  (ADD THIS - see SETUP.md)
      static/                  investigator dashboard
      selftest.py              pre-deployment verification
      SETUP.md                 deployment instructions

    team/                  each member's source work, not used at runtime
      m1-data/                 collection scripts, labels, provenance, QA report
      m2-features/             feature pipeline, schema, data dictionary
      m3-ml/                   training, baseline comparison, blind-test scripts
      m4-graph/                graph construction, clustering, scoring

    docs/                  per-member briefs, task order, idea presentation

---

## Deliberately not in this repository

| File | Why |
|---|---|
| `raw_transactions.csv` | 323 MB — exceeds GitHub's 100 MB hard limit. Not needed at runtime. Regenerate with `team/m1-data/Script_For_raw_transactions.py`. |
| `unknown_ground_truth.csv` | True labels for the 90 blind-test wallets. Publishing them beside the predictions would undermine the blind evaluation. |
| `full_graph_evidence.json` | 34 MB, superseded by `vasp_graph_index.json`. |

---

## Team

| Member | Module |
|---|---|
| M1 | Blockchain intelligence — collection, VASP labelling, provenance |
| M2 | Data engineering — feature pipeline, validation |
| M3 | Machine learning — training, evaluation, prediction service |
| M4 | Graph intelligence — transaction graph, clustering, scoring |
| M5 | Backend — API, orchestration, evidence fusion |
| M6 | Frontend — investigator dashboard, evidence display, reporting |
