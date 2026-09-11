/**
 * report.js
 * ---------
 * Builds a plain-text investigation report from the current attribution
 * result and triggers a browser download. No server round-trip needed —
 * everything the report needs is already in memory on the page.
 *
 * Plain <script>, not a module — see data_contract.js header for why.
 */

window.Report = window.Report || {};

window.Report.buildReportText = function({ prediction, transactions, generatedAt }) {
  const lines = [];
  lines.push("CRYPTOCURRENCY WALLET ATTRIBUTION — INVESTIGATION REPORT");
  lines.push("=".repeat(58));
  lines.push(`Generated: ${generatedAt.toLocaleString()}`);
  lines.push(`Suspect wallet: ${prediction.address}`);
  lines.push(`Chain: ${prediction.chain}`);
  lines.push("");

  if (prediction.unknown_or_insufficient_evidence) {
    lines.push("RESULT: Insufficient evidence for VASP attribution.");
    lines.push("This wallet did not match known VASP infrastructure with");
    lines.push("sufficient confidence. No candidate is being asserted.");
  } else {
    lines.push("RANKED VASP CANDIDATES");
    lines.push("-".repeat(58));
    prediction.ranked_vasps.forEach((v, i) => {
      lines.push(`${i + 1}. ${v.name} — confidence score ${v.score}`);
    });
    lines.push("");
    lines.push("SCORE BREAKDOWN");
    lines.push("-".repeat(58));
    lines.push(`  ML score:               ${prediction.ml_score}`);
    lines.push(`  Graph score:             ${prediction.graph_score}`);
    lines.push(`  Transaction behaviour:   ${prediction.transaction_score}`);
    lines.push("");
    lines.push("SUPPORTING EVIDENCE");
    lines.push("-".repeat(58));
    prediction.evidence.forEach((e) => lines.push(`  • ${e}`));
  }

  lines.push("");
  lines.push("TRANSACTION SUMMARY");
  lines.push("-".repeat(58));
  lines.push(`  Total transactions observed: ${transactions.length}`);
  if (transactions.length) {
    const sorted = [...transactions].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    lines.push(`  Earliest: ${new Date(sorted[0].timestamp).toLocaleString()}`);
    lines.push(`  Latest:   ${new Date(sorted[sorted.length - 1].timestamp).toLocaleString()}`);
  }

  lines.push("");
  lines.push("=".repeat(58));
  lines.push("NOTE: This is a probabilistic attribution based on on-chain");
  lines.push("evidence. A transaction relationship does not by itself prove");
  lines.push("ownership or criminal activity. Findings should be treated as");
  lines.push("investigative leads, not as legal proof.");

  return lines.join("\n");
}

window.Report.downloadReport = function(text, filename) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
