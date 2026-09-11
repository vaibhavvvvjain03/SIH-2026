# ASHEN ATTRIBUTION — Member 6 Frontend

## FINAL LIVE TEST

The frontend is configured for the **real M5 backend**:

- `USE_MOCK = false`
- Backend: `http://localhost:8000`
- Frontend: `http://localhost:5500`

### 1. Get M5 on the call

M5 must run the backend first:

```bash
uvicorn main:app --port 8000
```

Keep that terminal running.

### 2. Serve THIS folder over HTTP

Do **not** double-click `index.html` and do not use `file://`.

From this folder:

```bash
python -m http.server 5500
```

Or, on Windows, double-click:

```text
start_frontend_5500.bat
```

Then open:

```text
http://localhost:5500/index.html
```

Serving over HTTP is required for the browser frontend → FastAPI request.

## FINAL TEST WALLETS

Use Ethereum for all three.

| # | Address | Expected result |
|---|---|---|
| 1 | `0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be` | Binance, **0.99**, instant, evidence includes **Direct 0-hop match**, no transaction-count label |
| 2 | `0x0eefaf34f9ccf41366ab547330c8978be8fd3ff9` | Kraken, **0.9861**, a few seconds, **1000 ON-CHAIN TRANSACTIONS ANALYSED**, `◈ GRAPH` on Kraken |
| 3 | `0x4b6f17856215eab57c29ebfa18b0a0f74a3627bb` | **INSUFFICIENT EVIDENCE FOR VASP ATTRIBUTION**, no candidate |

### Screen checks

For wallet #2:

- Big confidence circle = **FUSED SCORE 0.99** when rounded to two decimals (backend raw value should be `0.9861`).
- It must not display the ML score `0.9967` in the big circle.
- **1000 ON-CHAIN TRANSACTIONS ANALYSED** is visible.
- `◈ GRAPH` appears on **Kraken only**.
- Evidence includes: **2 direct counterparties are known Kraken addresses**.

For wallet #3:

- The insufficient-evidence panel renders cleanly.
- No `NaN`, `undefined`, or blank candidate cards.

### Critical anti-mock test

After the three wallet tests:

1. Ask M5 to stop FastAPI with `Ctrl+C`.
2. Click **AWAKEN TRACE** once.

Expected message:

> The trace collapsed. Check the backend connection.

If a result still appears, stop and check that `USE_MOCK` has not been changed from `false`.

### If anything fails

Open browser DevTools:

```text
F12 → Console
```

Copy the full error. CORS/fetch errors will identify the connection problem.

## Files

- `index.html` — page structure
- `styles.css` — visual theme
- `data_contract.js` — backend connection and data normalization boundary
- `app.js` — lookup flow and result rendering
- `graph.js` — transaction graph
- `timeline.js` — transaction timeline
- `report.js` — report export
- `animations.js`, `particles.js`, `intro.js` — visual effects
- `start_frontend_5500.bat` — Windows helper to serve the frontend on port 5500

## Important

The frontend intentionally has:

```js
const USE_MOCK = false;
```

Do not change it to `true` for the final live demonstration.
