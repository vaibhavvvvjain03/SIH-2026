/**
 * charts.js — Forensic Visual Analytics Engine (SIH 2026)
 * Integrates Chart.js with dark cyber-forensic aesthetics (Ember/Ashen theme).
 * Zero modification to existing data contracts; seamlessly consumes prediction & transactions.
 */
window.ForensicCharts = window.ForensicCharts || {};

(function () {
  let radarChartInstance = null;
  let flowChartInstance = null;
  let vaspChartInstance = null;
  let cachedTransactions = [];
  let cachedPrediction = null;
  let cachedRoot = "";
  let currentFlowMode = "volume"; // 'volume' or 'count'

  /**
   * Set global Chart.js defaults to match Ashen dark cyber aesthetic.
   */
  function applyChartDefaults() {
    if (typeof Chart === "undefined") return;
    Chart.defaults.color = "#aba394";
    Chart.defaults.font.family = "'IBM Plex Mono', 'Inter', monospace";
    Chart.defaults.font.size = 11;
    Chart.defaults.plugins.tooltip.backgroundColor = "rgba(14, 16, 20, 0.95)";
    Chart.defaults.plugins.tooltip.borderColor = "rgba(245, 158, 11, 0.4)";
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.titleColor = "#f5f0e6";
    Chart.defaults.plugins.tooltip.bodyColor = "#ded7cb";
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 6;
    Chart.defaults.plugins.tooltip.boxPadding = 4;
  }

  /**
   * Compute rich forensic metrics from transaction set and prediction.
   */
  function analyzeForensicMetrics(transactions, prediction, rootAddress) {
    const root = (rootAddress || "").toLowerCase();
    let totalInflow = 0;
    let totalOutflow = 0;
    let inCount = 0;
    let outCount = 0;
    let maxTx = 0;
    const counterparties = new Map();
    const timestamps = [];

    transactions.forEach((tx) => {
      const val = Number(tx.value) || 0;
      if (val > maxTx) maxTx = val;
      const isOut = tx.from?.toLowerCase() === root;
      if (isOut) {
        totalOutflow += val;
        outCount++;
        const target = tx.to?.toLowerCase();
        if (target) counterparties.set(target, (counterparties.get(target) || 0) + val);
      } else {
        totalInflow += val;
        inCount++;
        const source = tx.from?.toLowerCase();
        if (source) counterparties.set(source, (counterparties.get(source) || 0) + val);
      }
      if (tx.timestamp) timestamps.push(new Date(tx.timestamp).getTime());
    });

    const totalVolume = totalInflow + totalOutflow;
    const netRetention = totalInflow - totalOutflow;
    const uniqueCounterparties = counterparties.size;

    // Time span & velocity calculation
    let spanDays = 1;
    if (timestamps.length > 1) {
      const minTime = Math.min(...timestamps);
      const maxTime = Math.max(...timestamps);
      spanDays = Math.max(0.1, (maxTime - minTime) / (1000 * 60 * 60 * 24));
    }
    const txPerDay = transactions.length ? (transactions.length / spanDays) : 0;

    // Structuring / rapid sweep index (0 to 1)
    // Wallets with high outflow-to-inflow ratio, low retention, and fast turnaround indicate pass-through/layering
    const sweepRatio = totalInflow > 0 ? Math.min(1.0, totalOutflow / totalInflow) : 0.5;
    const structuringIndex = Number(
      Math.min(0.98, Math.max(0.08, (sweepRatio * 0.55) + (transactions.length > 15 ? 0.3 : 0.1)))
    );

    // Top counterparty concentration
    let topConcentration = 0;
    if (counterparties.size > 0 && totalVolume > 0) {
      const sortedValues = [...counterparties.values()].sort((a, b) => b - a);
      const top3Total = sortedValues.slice(0, 3).reduce((acc, v) => acc + v, 0);
      topConcentration = Math.min(1.0, top3Total / totalVolume);
    } else {
      topConcentration = 0.5;
    }

    return {
      totalVolume,
      totalInflow,
      totalOutflow,
      netRetention,
      inCount,
      outCount,
      maxTx,
      uniqueCounterparties,
      spanDays,
      txPerDay,
      structuringIndex,
      topConcentration,
    };
  }

  /**
   * Render Multi-axial Risk Vector Radar Chart
   */
  function renderRadarChart(canvasId, prediction, metrics) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === "undefined") return;

    if (radarChartInstance) {
      radarChartInstance.destroy();
      radarChartInstance = null;
    }

    const mlScore = Number(prediction.ml_score || 0.5);
    const graphScore = Number(prediction.graph_score || prediction.fused_score || 0.5);
    const velocityScore = Math.min(1.0, Math.max(0.15, metrics.txPerDay / 12));
    const volumeScore = Math.min(1.0, Math.max(0.2, Math.log10(metrics.totalVolume + 1) / 3));
    const structuringScore = metrics.structuringIndex;
    const concentrationScore = Math.min(1.0, Math.max(0.15, metrics.topConcentration));

    const ctx = canvas.getContext("2d");
    radarChartInstance = new Chart(ctx, {
      type: "radar",
      data: {
        labels: [
          "ML Affinity",
          "Graph Proximity",
          "Tx Velocity",
          "Volume Density",
          "Layering / Sweep",
          "Entity Clustering",
        ],
        datasets: [
          {
            label: "Suspect Footprint",
            data: [
              (mlScore * 100).toFixed(1),
              (graphScore * 100).toFixed(1),
              (velocityScore * 100).toFixed(1),
              (volumeScore * 100).toFixed(1),
              (structuringScore * 100).toFixed(1),
              (concentrationScore * 100).toFixed(1),
            ],
            backgroundColor: "rgba(245, 158, 11, 0.22)",
            borderColor: "#f59e0b",
            borderWidth: 2.2,
            pointBackgroundColor: "#fbbf24",
            pointBorderColor: "#07080a",
            pointHoverBackgroundColor: "#ffffff",
            pointHoverBorderColor: "#f59e0b",
            pointRadius: 4,
            pointHoverRadius: 6,
          },
          {
            label: "Typical VASP Baseline",
            data: [85, 78, 65, 70, 35, 80],
            backgroundColor: "rgba(34, 197, 94, 0.08)",
            borderColor: "rgba(34, 197, 94, 0.5)",
            borderWidth: 1.5,
            borderDash: [4, 4],
            pointBackgroundColor: "#22c55e",
            pointBorderColor: "#07080a",
            pointRadius: 2.5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: {
              stepSize: 25,
              display: false,
            },
            grid: {
              color: "rgba(255, 255, 255, 0.07)",
            },
            angleLines: {
              color: "rgba(245, 158, 11, 0.15)",
            },
            pointLabels: {
              color: "#ded7cb",
              font: {
                family: "'Inter', sans-serif",
                size: 11,
                weight: "500",
              },
            },
          },
        },
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              boxWidth: 12,
              padding: 14,
              color: "#ded7cb",
              font: { family: "'IBM Plex Mono', monospace", size: 10 },
            },
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return `${ctx.dataset.label}: ${ctx.raw}% intensity`;
              },
            },
          },
        },
      },
    });
  }

  /**
   * Render Transaction Flow & Volume Dynamics Chart (Chronological)
   */
  function renderFlowChart(canvasId, transactions, rootAddress, mode = "volume") {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === "undefined") return;

    if (flowChartInstance) {
      flowChartInstance.destroy();
      flowChartInstance = null;
    }

    const root = (rootAddress || "").toLowerCase();
    // Sort transactions chronologically
    const sorted = [...transactions].sort((a, b) => {
      const tA = a.timestamp ? new Date(a.timestamp).getTime() : a.block_number || 0;
      const tB = b.timestamp ? new Date(b.timestamp).getTime() : b.block_number || 0;
      return tA - tB;
    });

    const displayTx = sorted.slice(-20); // Focus on recent sequence
    const labels = displayTx.map((tx, idx) => {
      if (tx.timestamp) {
        const d = new Date(tx.timestamp);
        return `${d.getMonth() + 1}/${d.getDate()} #${idx + 1}`;
      }
      return `Tx #${idx + 1}`;
    });

    const inflows = [];
    const outflows = [];

    displayTx.forEach((tx) => {
      const val = Number(tx.value) || 0;
      const isOut = tx.from?.toLowerCase() === root;
      if (isOut) {
        outflows.push(mode === "volume" ? Number(val.toFixed(4)) : 1);
        inflows.push(0);
      } else {
        inflows.push(mode === "volume" ? Number(val.toFixed(4)) : 1);
        outflows.push(0);
      }
    });

    const ctx = canvas.getContext("2d");
    flowChartInstance = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Inflow (Received ETH)",
            data: inflows,
            backgroundColor: "rgba(34, 197, 94, 0.75)",
            borderColor: "#22c55e",
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: "Outflow (Dispersed ETH)",
            data: outflows,
            backgroundColor: "rgba(249, 115, 22, 0.8)",
            borderColor: "#f97316",
            borderWidth: 1,
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        scales: {
          x: {
            stacked: true,
            grid: { color: "rgba(255, 255, 255, 0.04)" },
            ticks: {
              color: "#aba394",
              font: { size: 10 },
              maxRotation: 45,
            },
          },
          y: {
            stacked: true,
            grid: { color: "rgba(255, 255, 255, 0.06)" },
            ticks: {
              color: "#ded7cb",
              callback: function (val) {
                return mode === "volume" ? `${val} Ξ` : `${val} tx`;
              },
            },
          },
        },
        plugins: {
          legend: {
            position: "top",
            align: "end",
            labels: {
              boxWidth: 10,
              padding: 10,
              color: "#ded7cb",
              font: { family: "'IBM Plex Mono', monospace", size: 10 },
            },
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                const label = ctx.dataset.label || "";
                const val = ctx.raw || 0;
                if (val === 0) return null;
                return mode === "volume" ? `${label}: ${val} ETH` : `${label}: ${val} tx`;
              },
            },
          },
        },
      },
    });
  }

  /**
   * Render VASP Attribution & Exposure Radial/Doughnut Chart
   */
  function renderVaspChart(canvasId, prediction) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === "undefined") return;

    if (vaspChartInstance) {
      vaspChartInstance.destroy();
      vaspChartInstance = null;
    }

    const vasps = prediction.ranked_vasps || [];
    let labels = [];
    let data = [];
    const colors = [
      "rgba(245, 158, 11, 0.9)",  // Amber Gold
      "rgba(6, 182, 212, 0.85)",  // Neon Cyan
      "rgba(168, 85, 247, 0.85)", // Amethyst Purple
      "rgba(34, 197, 94, 0.8)",   // Emerald Green
      "rgba(100, 116, 139, 0.7)", // Muted Slate
    ];

    if (vasps.length === 0) {
      labels = ["Unknown / Insufficient"];
      data = [100];
    } else {
      vasps.forEach((v) => {
        labels.push(v.name);
        data.push(Number((v.score * 100).toFixed(1)));
      });
      // Remaining residual confidence
      const sum = data.reduce((a, b) => a + b, 0);
      if (sum < 99) {
        labels.push("Uncertainty / Other");
        data.push(Number((100 - sum).toFixed(1)));
      }
    }

    const ctx = canvas.getContext("2d");
    vaspChartInstance = new Chart(ctx, {
      type: "pie",
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: colors.slice(0, data.length),
            borderColor: "#0b0d11",
            borderWidth: 2,
            hoverOffset: 8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              boxWidth: 12,
              padding: 12,
              color: "#ded7cb",
              font: { family: "'IBM Plex Mono', monospace", size: 10.5 },
            },
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return ` ${ctx.label}: ${ctx.raw}% probability`;
              },
            },
          },
        },
      },
    });
  }

  /**
   * Update the 4 Quick Forensic Metric Cards in the Analytics Hub
   */
  function updateMetricCards(metrics, prediction) {
    const volEl = document.getElementById("metric-card-vol");
    const velEl = document.getElementById("metric-card-vel");
    const structEl = document.getElementById("metric-card-struct");
    const clustEl = document.getElementById("metric-card-clust");

    if (volEl) {
      volEl.innerHTML = `
        <div class="kpi-val">${metrics.totalVolume.toFixed(2)} <span class="kpi-unit">ETH</span></div>
        <div class="kpi-sub">In: ${metrics.totalInflow.toFixed(2)} Ξ · Out: ${metrics.totalOutflow.toFixed(2)} Ξ</div>
      `;
    }

    if (velEl) {
      const burstTag = metrics.txPerDay > 5 ? "BURST PATTERN" : "STEADY CADENCE";
      velEl.innerHTML = `
        <div class="kpi-val">${metrics.txPerDay.toFixed(1)} <span class="kpi-unit">tx/day</span></div>
        <div class="kpi-sub">${metrics.spanDays.toFixed(0)} active days · <span class="badge-sub">${burstTag}</span></div>
      `;
    }

    if (structEl) {
      const lvl = metrics.structuringIndex > 0.65 ? "ELEVATED" : metrics.structuringIndex > 0.4 ? "MODERATE" : "MINIMAL";
      const lvlClass = metrics.structuringIndex > 0.65 ? "danger" : metrics.structuringIndex > 0.4 ? "warn" : "safe";
      structEl.innerHTML = `
        <div class="kpi-val ${lvlClass}">${lvl} <span class="kpi-unit">${(metrics.structuringIndex * 100).toFixed(0)}%</span></div>
        <div class="kpi-sub">Pass-through sweep & rapid turnaround index</div>
      `;
    }

    if (clustEl) {
      const topVasp = prediction.ranked_vasps && prediction.ranked_vasps[0] ? prediction.ranked_vasps[0].name : "None";
      clustEl.innerHTML = `
        <div class="kpi-val">${metrics.uniqueCounterparties} <span class="kpi-unit">nodes</span></div>
        <div class="kpi-sub">Dominant cluster anchor: <strong>${topVasp}</strong></div>
      `;
    }
  }

  /**
   * Main entry point called by app.js when results arrive.
   */
  window.ForensicCharts.renderForensicCharts = function ({ prediction, transactions, rootAddress }) {
    applyChartDefaults();
    cachedTransactions = transactions || [];
    cachedPrediction = prediction;
    cachedRoot = rootAddress;

    const metrics = analyzeForensicMetrics(cachedTransactions, prediction, rootAddress);
    updateMetricCards(metrics, prediction);

    renderRadarChart("radar-chart", prediction, metrics);
    renderFlowChart("flow-chart", cachedTransactions, rootAddress, currentFlowMode);
    renderVaspChart("vasp-chart", prediction);
  };

  /**
   * Toggle between ETH Volume and Transaction Count view
   */
  window.ForensicCharts.toggleFlowMode = function (mode) {
    if (mode === currentFlowMode) return;
    currentFlowMode = mode;
    if (cachedTransactions.length && cachedRoot) {
      renderFlowChart("flow-chart", cachedTransactions, cachedRoot, currentFlowMode);
    }
  };

  /**
   * Cleanup on new query
   */
  window.ForensicCharts.destroyCharts = function () {
    if (radarChartInstance) {
      radarChartInstance.destroy();
      radarChartInstance = null;
    }
    if (flowChartInstance) {
      flowChartInstance.destroy();
      flowChartInstance = null;
    }
    if (vaspChartInstance) {
      vaspChartInstance.destroy();
      vaspChartInstance = null;
    }
  };
})();
