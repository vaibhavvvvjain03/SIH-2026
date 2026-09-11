# Deploy — one repo, one URL

Everything is a single service now: FastAPI serves the dashboard AND the API.
No CORS, no second deployment, no localhost in any config file.

    https://<host>/          dashboard
    https://<host>/docs      API docs
    https://<host>/attribution?address=0x...&chain=ethereum

---------------------------------------------------------------------------
## STEP 1 — add the model folder

Copy M3's `results_564/` into this folder and RENAME it to `results`:

    vasp-app/
    |-- main.py
    |-- predict_service.py
    |-- graph_service.py
    |-- vasp_graph_index.json
    |-- M1_labelled_wallets_30-3.csv
    |-- requirements.txt
    |-- render.yaml
    |-- README.md
    |-- .gitignore
    |-- static/                  (the whole frontend)
    `-- results/                 <-- ADD THIS
        |-- random_forest_pipeline.joblib
        |-- label_encoder.joblib
        |-- isolation_forest_model.joblib
        |-- anomaly_imputer.joblib
        `-- classification_metrics.json

---------------------------------------------------------------------------
## STEP 2 — pin the right scikit-learn version

joblib models are version-sensitive. Have M3 run:

    python -c "import sklearn; print(sklearn.__version__)"

Edit requirements.txt so `scikit-learn==` matches that exactly. Skipping this
produces warnings and, at worst, different predictions than you measured.

---------------------------------------------------------------------------
## STEP 3 — test locally, exactly as it will run in production

    pip install -r requirements.txt
    uvicorn main:app --port 8000

Open http://localhost:8000 — the dashboard should load and a test wallet
should return a result. Startup must print:

    [startup] Loaded 564 labelled wallets.
    [startup] Per-VASP graph scorer ready (81558 indexed counterparties).
    [startup] Serving frontend from .../static

If it works here it will work deployed, because it is the same single process.

---------------------------------------------------------------------------
## STEP 4 — push to GitHub

    git init
    git add .
    git commit -m "VASP attribution - single deployable app"
    git branch -M main
    git remote add origin https://github.com/<user>/vasp-app.git
    git push -u origin main

Then open the repo in a browser and confirm `results/` and
`vasp_graph_index.json` are actually there. If the .joblib files are missing the
app cannot start.

---------------------------------------------------------------------------
## STEP 5 — deploy on Render

1. render.com -> New -> Web Service -> pick the repo
2. Runtime Python 3 | Build `pip install -r requirements.txt`
   | Start `uvicorn main:app --host 0.0.0.0 --port $PORT` | Free
3. Environment tab:
     ETHERSCAN_API_KEY = <a NEW key, rotate the old one>
     PYTHON_VERSION    = 3.11.9
4. Create.

You get one URL. Share it. It works on phones, tablets, any browser.

Why Render and not Vercel: Vercel runs Python as serverless functions with a
250 MB bundle cap and a 10 second timeout. pandas + numpy + scipy +
scikit-learn is roughly 250-300 MB, and an attribution takes 3-8 seconds plus
model load. It will not fit and it will time out. Render runs an ordinary
long-lived process, which is what this app expects.

---------------------------------------------------------------------------
## THE ONE THING THAT WILL EMBARRASS YOU

Render's free tier sleeps after 15 minutes idle. The next request takes 30-60
seconds while it wakes, which looks broken to a judge who is clicking.

Fix it with either:
  - open the URL yourself 5 minutes before presenting, or
  - point a free pinger (uptimerobot.com) at https://<host>/docs every 10 min

Keep localhost running as a backup regardless.
