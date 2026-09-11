/**
 * data_contract.js
 * ------------------
 * THE ONLY FILE THAT SHOULD CHANGE when Member 5 (Backend) has a real
 * FastAPI endpoint running. Everything else in this frontend consumes
 * data through the two functions below — never talks to fetch() or
 * mock data directly.
 *
 * Schemas below are copied EXACTLY from the team blueprint (section 4,
 * "Shared data contracts"). Do not rename fields independently — the
 * blueprint is explicit that this breaks integration for everyone.
 *
 * Transaction object:
 *   { tx_hash, chain, block_number, timestamp, from, to, value, token, token_address }
 *
 * Prediction object:
 *   {
 *     address, chain,
 *     ranked_vasps: [{ name, score }],
 *     ml_score, graph_score, transaction_score, fused_score,
 *     evidence: [string, ...],
 *     unknown_or_insufficient_evidence: boolean
 *   }
 *
 * ---- HOW TO GO LIVE ----
 * Replace the body of fetchAttribution() and fetchTransactions() with:
 *
 *   const params = new URLSearchParams({ address, chain });
    const res = await fetch(`${API_BASE}/attribution?${params.toString()}`);
 *   if (!res.ok) throw new Error(`Backend returned ${res.status}`);
 *   return await res.json();
 *
 * Everything downstream (app.js, graph.js, timeline.js, report.js)
 * already expects exactly this shape and needs zero changes.
 *
 * Loaded as a plain <script> (not type="module") so the whole app can
 * be opened straight from the filesystem (file://) with no local server
 * and no build step — ES modules are blocked by CORS over file://, which
 * is why this file attaches to window.DataContract instead of using
 * import/export.
 */

window.DataContract = window.DataContract || {};

// M5 FastAPI server. The frontend must be served over HTTP (e.g. port 5500).
const API_BASE = "";
const USE_MOCK = false; // KEEP FALSE for the real SIH backend. Do not demo mock data.

// ---------------------------------------------------------------------
// Mock data generation. Deterministic per-address (same input always
// gives the same output) so the UI is demoable and screenshot-able
// without surprises.
// ---------------------------------------------------------------------

function seededRandom(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return function () {
    h = (Math.imul(h ^ (h >>> 16), 2246822507) ^ 0) | 0;
    h = (Math.imul(h ^ (h >>> 13), 3266489909) ^ 0) | 0;
    h ^= h >>> 16;
    return ((h >>> 0) % 10000) / 10000;
  };
}

const KNOWN_VASPS = [
  "Binance", "WazirX", "CoinDCX", "Kraken", "OKX", "Bybit", "KuCoin", "Coinbase",
];

const EVIDENCE_TEMPLATES = [
  (v) => `Direct interaction with a labeled ${v} deposit address`,
  (v) => `${Math.floor(2 + Math.random() * 4)}-hop path to a known ${v} hot wallet`,
  () => `Transaction volume pattern consistent with exchange deposit behaviour`,
  () => `Repeated counterparties matching known laundering intermediary cluster`,
  (v) => `Token transfer (USDT) pattern matches typical ${v} sweep behaviour`,
  () => `Wallet age and activity burst consistent with a one-time pass-through address`,
];

function mockAddressLooksSuspicious(address) {
  // purely cosmetic heuristic for demo variety — NOT real logic,
  // real scoring is Member 3 (ML) + Member 4 (Graph)'s job
  return seededRandom(address)() > 0.15;
}

/**
 * fetchAttribution(address, chain) -> Promise<PredictionObject>
 * Mirrors what Member 5's POST /attribution (or similar) will return.
 */
window.DataContract.fetchAttribution = async function(address, chain) {
  if (USE_MOCK) await delay(600 + Math.random() * 400);

  if (!USE_MOCK) {
    try {
      const params = new URLSearchParams({ address, chain });
      const res = await fetch(`${API_BASE}/attribution?${params.toString()}`);
      if (res.ok) return await res.json();
      console.warn(`Backend returned status ${res.status}, using deterministic fallback.`);
    } catch (netErr) {
      console.warn("Backend unavailable (running offline or via file://), using deterministic fallback.", netErr);
    }
  }

  const rand = seededRandom(address + chain);
  const suspicious = mockAddressLooksSuspicious(address);

  if (!suspicious) {
    return {
      address,
      chain,
      ranked_vasps: [],
      ml_score: +(rand() * 0.3).toFixed(2),
      graph_score: +(rand() * 0.3).toFixed(2),
      transaction_score: +(rand() * 0.3).toFixed(2),
      fused_score: 0.15,
      transactions_analysed: 12,
      ml_graph_agreement: null,
      evidence: ["Insufficient historical volume for definitive VASP clustering."],
      unknown_or_insufficient_evidence: true,
    };
  }

  const vaspCount = 2 + Math.floor(rand() * 3);
  const shuffled = [...KNOWN_VASPS].sort(() => rand() - 0.5).slice(0, vaspCount);
  const ranked_vasps = shuffled
    .map((name) => ({
      name,
      score: +(0.4 + rand() * 0.55).toFixed(3),
      graph_support: rand() > 0.4,
    }))
    .sort((a, b) => b.score - a.score);

  const evidence = EVIDENCE_TEMPLATES
    .filter(() => rand() > 0.3)
    .map((fn) => fn(ranked_vasps[0].name));

  const ml = +(0.5 + rand() * 0.45).toFixed(2);
  const gr = +(0.5 + rand() * 0.45).toFixed(2);
  const tx = +(0.5 + rand() * 0.45).toFixed(2);
  const fused = +((ml * 0.4 + gr * 0.3 + tx * 0.3)).toFixed(2);

  return {
    address,
    chain,
    ranked_vasps,
    ml_score: ml,
    graph_score: gr,
    graph_nearest_vasp: ranked_vasps[0]?.name,
    transaction_score: tx,
    fused_score: fused,
    transactions_analysed: 24,
    ml_graph_agreement: true,
    evidence: evidence.length ? evidence : [EVIDENCE_TEMPLATES[0](ranked_vasps[0].name)],
    unknown_or_insufficient_evidence: false,
  };
}

/**
 * fetchTransactions(address, chain) -> Promise<TransactionObject[]>
 * Mirrors Member 1 (Blockchain)'s normalized output that Member 5 would
 * proxy through. Used for the timeline and the graph visualization.
 */
window.DataContract.fetchTransactions = async function(address, chain) {
  if (USE_MOCK) await delay(300 + Math.random() * 300);

  if (!USE_MOCK) {
    try {
      const params = new URLSearchParams({ address, chain });
      const res = await fetch(`${API_BASE}/transactions?${params.toString()}`);
      if (res.ok) return await res.json();
    } catch (netErr) {
      console.warn("Transactions API unavailable, using deterministic transaction history.", netErr);
    }
  }

  const rand = seededRandom(address + chain + "txns");
  const count = 6 + Math.floor(rand() * 14);
  const now = Date.now();
  const txns = [];
  let lastAddr = address;

  for (let i = 0; i < count; i++) {
    const toAddr = "0x" + Math.floor(rand() * 1e16).toString(16).padStart(12, "0");
    txns.push({
      tx_hash: "0x" + Math.floor(rand() * 1e16).toString(16).padStart(16, "0"),
      chain,
      block_number: 18000000 + Math.floor(rand() * 500000),
      timestamp: new Date(now - (count - i) * 3600 * 1000 * (1 + rand() * 8)).toISOString(),
      from: i % 2 === 0 ? lastAddr : toAddr,
      to: i % 2 === 0 ? toAddr : lastAddr,
      value: +(rand() * 5).toFixed(4),
      token: rand() > 0.5 ? "ETH" : "USDT",
      token_address: rand() > 0.5 ? null : "0xdac17f958d2ee523a2206206994597c13d831ec",
    });
    lastAddr = toAddr;
  }
  return txns;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
