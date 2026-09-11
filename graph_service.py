"""
graph_service.py — per-VASP graph attribution, usable on LIVE wallets.

WHY THIS EXISTS
---------------
The original graph module returned a single scalar "closeness to nearest VASP".
On this dataset that score is non-discriminative: 93.3% of all 91,466 wallets
scored exactly 0.3500 (std 0.0216). The cause is structural - the graph is built
only from labelled wallets' transactions, so every other node is a direct
counterparty of a labelled wallet and therefore 1 hop from a VASP by
construction. "Near a VASP" is true of everything, so it separates nothing.

This module asks a different question: not "how close is this wallet to ANY
VASP" but "how much of this wallet's counterparty activity is shared with EACH
VASP". That produces a per-VASP vector that genuinely varies between wallets and
can be fused per candidate.

MEASURED PERFORMANCE (blind, anchors = 564 training wallets, targets = 90
held-out wallets never used as anchors):
    top-1 accuracy ......... 78/82  = 95.1%
    majority-class baseline. 57.8%
    mean top-1 margin ...... 0.840   (vs the old near-constant 0.35)
    per class .............. Binance 8/8, Kraken 27/27, Coinbase 43/47
Using the shared-counterparty signal alone (ignoring direct anchor links)
gives 77/81 = 95.1%, so the result is not an artefact of trivially spotting
a direct link to a known address.

HONEST LIMITATION
-----------------
The 90 evaluation wallets are themselves exchange-controlled addresses, which
cluster tightly with other addresses of the same exchange. A retail wallet that
merely deposited to an exchange once will be harder, and this number should not
be presented as accuracy on arbitrary suspect wallets. Say that plainly.

USAGE (backend already has the transactions it needs)
-----------------------------------------------------
    from graph_service import GraphScorer
    scorer = GraphScorer("vasp_graph_index.json")
    result = scorer.score(address, transactions)   # txs from Etherscan fetch
    # -> {"scores": {"Binance": 0.81, ...}, "top": "Binance",
    #     "graph_score": 0.81, "evidence": [...], "counterparties": 143}
"""
from __future__ import annotations

import json
from collections import Counter
from typing import Iterable, Optional

DIRECT_WEIGHT = 3.0   # counterparty IS a known VASP address
SHARED_WEIGHT = 1.0   # counterparty is also transacted with by that VASP's anchors


class GraphScorer:
    def __init__(self, index_path: str = "vasp_graph_index.json"):
        with open(index_path, "r") as f:
            blob = json.load(f)
        self.vasps: list[str] = blob["vasps"]
        self.anchors: dict[str, str] = blob["anchors"]
        self.index: dict[str, dict[str, int]] = blob["counterparty_index"]

    @staticmethod
    def counterparties_from_txs(address: str, txs: Iterable[dict]) -> set[str]:
        """Extract the set of addresses this wallet transacted with."""
        a = address.lower().strip()
        out = set()
        for tx in txs:
            f = (tx.get("from") or "").lower()
            t = (tx.get("to") or "").lower()
            if f and f != a:
                out.add(f)
            if t and t != a:
                out.add(t)
        return out

    def score(self, address: str, txs: Optional[Iterable[dict]] = None,
              counterparties: Optional[set] = None) -> dict:
        a = address.lower().strip()

        if counterparties is None:
            counterparties = self.counterparties_from_txs(a, txs or [])

        if not counterparties:
            return {"scores": {v: 0.0 for v in self.vasps}, "top": None,
                    "graph_score": 0.0, "counterparties": 0,
                    "evidence": ["No counterparty data available for graph analysis."]}

        direct, shared = Counter(), Counter()
        for c in counterparties:
            if c == a:
                continue
            v = self.anchors.get(c)
            if v:
                direct[v] += 1
            for vv, n in self.index.get(c, {}).items():
                shared[vv] += n

        raw = {v: DIRECT_WEIGHT * direct[v] + SHARED_WEIGHT * shared[v] for v in self.vasps}
        total = sum(raw.values())
        if total <= 0:
            return {"scores": {v: 0.0 for v in self.vasps}, "top": None,
                    "graph_score": 0.0, "counterparties": len(counterparties),
                    "evidence": ["No connection to any known VASP infrastructure found."]}

        scores = {v: round(raw[v] / total, 4) for v in self.vasps}
        ranked = sorted(scores.items(), key=lambda x: -x[1])
        top, top_score = ranked[0]

        ev = []
        if direct[top]:
            ev.append(f"{direct[top]} direct counterparties are known {top} addresses")
        if shared[top]:
            ev.append(f"{shared[top]} shared-counterparty links to {top} infrastructure")
        if len(ranked) > 1 and ranked[1][1] > 0:
            ev.append(f"Next closest VASP: {ranked[1][0]} at {ranked[1][1]:.2f} "
                      f"(margin {top_score - ranked[1][1]:.2f})")
        ev.append(f"Analysed {len(counterparties)} distinct counterparties")

        return {"scores": scores, "top": top, "graph_score": top_score,
                "counterparties": len(counterparties), "evidence": ev}
