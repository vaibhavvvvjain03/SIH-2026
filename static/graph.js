/**
 * graph.js — Forensic Transaction Graph Engine (SIH 2026)
 * Redesigned for immediate visual clarity, intuitive directional flow,
 * zero text collisions, and interactive forensic inspection.
 */
window.Graph = window.Graph || {};

(function () {
  let currentFilter = "all"; // 'all', 'in', 'out'
  let currentLayout = "flow"; // 'flow' (Left-to-Right Stages), 'orbit' (Radar Orbit)
  let currentZoom = 1;
  let currentPan = { x: 0, y: 0 };
  let cachedData = null;
  let cachedContainer = null;
  let pinnedNodeId = null;
  let activeTooltip = null;

  window.Graph.renderTransactionGraph = function (container, { rootAddress, transactions, vaspNames, transactionsAnalysed }) {
    cachedContainer = container;
    cachedData = { rootAddress, transactions: transactions || [], vaspNames: vaspNames || [], transactionsAnalysed: transactionsAnalysed || null };
    pinnedNodeId = null;
    currentZoom = 1;
    currentPan = { x: 0, y: 0 };
    render();
  };

  function render() {
    if (!cachedContainer || !cachedData) return;
    const container = cachedContainer;
    const { rootAddress, transactions, vaspNames, transactionsAnalysed } = cachedData;
    container.innerHTML = "";

    const clientW = container.clientWidth || 720;
    const clientH = container.clientHeight || 420;
    const root = (rootAddress || "").toLowerCase();

    if (!transactions.length) {
      container.innerHTML = `
        <div class="empty-graph-state">
          <div class="empty-rune">◈</div>
          <strong>NO ON-CHAIN EDGES DETECTED</strong>
          <p>This wallet has not recorded transaction transfers within the indexed block window.</p>
        </div>
      `;
      return;
    }

    // 1. Process Nodes and Edges
    const nodeMap = new Map();
    const edgeMap = new Map();

    function getOrCreateNode(addr) {
      const id = (addr || "").toLowerCase();
      if (!nodeMap.has(id)) {
        const isRoot = id === root;
        let vaspMatch = null;
        if (vaspNames && vaspNames.length) {
          for (const v of vaspNames) {
            if (id.includes(v.toLowerCase())) {
              vaspMatch = v;
              break;
            }
          }
        }
        nodeMap.set(id, {
          id,
          rawAddress: addr,
          isRoot,
          vaspMatch,
          totalIn: 0,
          totalOut: 0,
          txCount: 0,
          x: clientW / 2,
          y: clientH / 2,
        });
      }
      return nodeMap.get(id);
    }

    transactions.forEach((tx) => {
      const fromAddr = (tx.from || "").toLowerCase();
      const toAddr = (tx.to || "").toLowerCase();
      const val = Number(tx.value) || 0;

      const fromNode = getOrCreateNode(fromAddr);
      const toNode = getOrCreateNode(toAddr);

      fromNode.totalOut += val;
      toNode.totalIn += val;
      fromNode.txCount++;
      toNode.txCount++;

      const edgeKey = `${fromAddr}->${toAddr}`;
      if (!edgeMap.has(edgeKey)) {
        edgeMap.set(edgeKey, {
          key: edgeKey,
          source: fromAddr,
          target: toAddr,
          value: 0,
          txCount: 0,
          token: tx.token || "ETH",
          hashes: [],
        });
      }
      const e = edgeMap.get(edgeKey);
      e.value += val;
      e.txCount++;
      if (tx.tx_hash) e.hashes.push(tx.tx_hash);
    });

    const nodes = [...nodeMap.values()];
    const edges = [...edgeMap.values()];

    const rootNode = nodeMap.get(root) || {
      id: root,
      rawAddress: rootAddress,
      isRoot: true,
      totalIn: 0,
      totalOut: 0,
      txCount: transactions.length,
      x: clientW / 2,
      y: clientH / 2,
    };

    // Classify counterparties into Inflow and Outflow
    const counterpartyNodes = nodes.filter((n) => !n.isRoot);
    const inflowNodes = [];
    const outflowNodes = [];
    const mixedNodes = [];

    let totalInflowEth = 0;
    let totalOutflowEth = 0;

    counterpartyNodes.forEach((n) => {
      if (n.totalIn > 0 && n.totalOut > 0) {
        mixedNodes.push(n);
        totalInflowEth += n.totalOut;
        totalOutflowEth += n.totalIn;
      } else if (n.totalOut > 0) {
        inflowNodes.push(n); // Out from counterparty = Inflow to suspect
        totalInflowEth += n.totalOut;
      } else {
        outflowNodes.push(n); // In to counterparty = Outflow from suspect
        totalOutflowEth += n.totalIn;
      }
    });

    // Sort counterparties by volume descending
    inflowNodes.sort((a, b) => b.totalOut - a.totalOut);
    outflowNodes.sort((a, b) => b.totalIn - a.totalIn);

    // Dynamic sizing to guarantee zero label collisions
    const maxSideNodes = Math.max(inflowNodes.length, outflowNodes.length, 1);
    const baseHeight = Math.max(clientH, 420);
    // Guarantee at least 46px per node if there are many nodes
    const dynamicHeight = currentLayout === "flow" 
      ? Math.max(baseHeight, maxSideNodes > 7 ? 120 + maxSideNodes * 46 : baseHeight)
      : Math.max(baseHeight, maxSideNodes > 8 ? 480 : baseHeight);
    const dynamicWidth = Math.max(clientW, 760);

    // Compute node coordinates based on layout
    if (currentLayout === "flow") {
      layoutFlowStages(inflowNodes, outflowNodes, mixedNodes, rootNode, dynamicWidth, dynamicHeight);
    } else {
      layoutRadarOrbit(inflowNodes, outflowNodes, mixedNodes, rootNode, dynamicWidth, dynamicHeight);
    }

    // SVG Initialization
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${dynamicWidth} ${dynamicHeight}`);
    svg.setAttribute("class", "graph-svg-canvas");

    // Definitions (Glows, Arrows, Gradients)
    const defs = document.createElementNS(NS, "defs");

    // Inflow Arrow (Green)
    const markerIn = document.createElementNS(NS, "marker");
    markerIn.setAttribute("id", "arrow-inflow");
    markerIn.setAttribute("viewBox", "0 0 10 10");
    markerIn.setAttribute("refX", "16");
    markerIn.setAttribute("refY", "5");
    markerIn.setAttribute("markerWidth", "5");
    markerIn.setAttribute("markerHeight", "5");
    markerIn.setAttribute("orient", "auto");
    markerIn.innerHTML = '<path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#22c55e" />';
    defs.appendChild(markerIn);

    // Outflow Arrow (Ember Orange)
    const markerOut = document.createElementNS(NS, "marker");
    markerOut.setAttribute("id", "arrow-outflow");
    markerOut.setAttribute("viewBox", "0 0 10 10");
    markerOut.setAttribute("refX", "16");
    markerOut.setAttribute("refY", "5");
    markerOut.setAttribute("markerWidth", "5");
    markerOut.setAttribute("markerHeight", "5");
    markerOut.setAttribute("orient", "auto");
    markerOut.innerHTML = '<path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#f59e0b" />';
    defs.appendChild(markerOut);

    // Root Glow Filter
    const rootFilter = document.createElementNS(NS, "filter");
    rootFilter.setAttribute("id", "root-glow");
    rootFilter.setAttribute("x", "-50%");
    rootFilter.setAttribute("y", "-50%");
    rootFilter.setAttribute("width", "200%");
    rootFilter.setAttribute("height", "200%");
    rootFilter.innerHTML = `
      <feGaussianBlur stdDeviation="6" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    `;
    defs.appendChild(rootFilter);

    svg.appendChild(defs);

    // Interactive Viewport Group (Pan & Zoom)
    const gViewport = document.createElementNS(NS, "g");
    gViewport.setAttribute("id", "graph-viewport");
    gViewport.setAttribute("transform", `translate(${currentPan.x}, ${currentPan.y}) scale(${currentZoom})`);

    // Draw Background Stage Columns / Radar Rings
    if (currentLayout === "flow") {
      drawStageHeaders(gViewport, NS, dynamicWidth, dynamicHeight, totalInflowEth, totalOutflowEth, inflowNodes.length, outflowNodes.length, transactions.length, transactionsAnalysed);
    } else {
      drawRadarRings(gViewport, NS, dynamicWidth, dynamicHeight);
    }

    // Layer 1: Connecting Edges
    const edgeGroup = document.createElementNS(NS, "g");
    edgeGroup.setAttribute("class", "graph-edges-layer");

    // Find top inflow and top outflow edge for smart callout
    let topInEdge = null;
    let topOutEdge = null;
    edges.forEach((e) => {
      const isInflow = e.target === root;
      if (isInflow) {
        if (!topInEdge || e.value > topInEdge.value) topInEdge = e;
      } else {
        if (!topOutEdge || e.value > topOutEdge.value) topOutEdge = e;
      }
    });

    edges.forEach((e) => {
      const src = nodeMap.get(e.source);
      const tgt = nodeMap.get(e.target);
      if (!src || !tgt) return;

      const isInflow = tgt.id === root;
      const strokeColor = isInflow ? "#22c55e" : "#f59e0b";
      const markerId = isInflow ? "url(#arrow-inflow)" : "url(#arrow-outflow)";

      // Smooth S-Curve or Quadratic Arc
      let pathData = "";
      let midX = (src.x + tgt.x) / 2;
      let midY = (src.y + tgt.y) / 2;

      if (currentLayout === "flow") {
        // Cubic Bézier with horizontal tangent for clean stage flow
        const c1x = src.x + (tgt.x - src.x) * 0.5;
        const c1y = src.y;
        const c2x = src.x + (tgt.x - src.x) * 0.5;
        const c2y = tgt.y;
        pathData = `M ${src.x} ${src.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tgt.x} ${tgt.y}`;
        midX = (src.x + tgt.x) / 2;
        midY = (src.y + tgt.y) / 2;
      } else {
        // Quadratic arc
        const dx = tgt.x - src.x;
        const dy = tgt.y - src.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const curvature = 16;
        const cx = (src.x + tgt.x) / 2 - (dy / dist) * curvature;
        const cy = (src.y + tgt.y) / 2 + (dx / dist) * curvature;
        pathData = `M ${src.x} ${src.y} Q ${cx} ${cy} ${tgt.x} ${tgt.y}`;
        midX = cx;
        midY = cy;
      }

      // Base edge line
      const edgePath = document.createElementNS(NS, "path");
      edgePath.setAttribute("d", pathData);
      edgePath.setAttribute("fill", "none");
      edgePath.setAttribute("stroke", strokeColor);
      const strokeW = Math.min(4.2, Math.max(1.8, Math.log10(e.value + 1) * 2.2));
      edgePath.setAttribute("stroke-width", strokeW);
      edgePath.setAttribute("stroke-opacity", "0.65");
      edgePath.setAttribute("marker-end", markerId);
      edgePath.setAttribute("class", `graph-edge-path edge-${isInflow ? "inflow" : "outflow"}`);
      edgePath.setAttribute("data-source", src.id);
      edgePath.setAttribute("data-target", tgt.id);
      edgePath.setAttribute("data-edgekey", e.key);

      // Edge hover interaction: show clean interactive floating badge
      edgePath.addEventListener("mouseenter", () => {
        highlightEdge(e.key, src.id, tgt.id);
        showPathCallout(e, isInflow, src, tgt, midX, midY);
        updateInspector({
          title: `ON-CHAIN TRANSFER (${isInflow ? "INFLOW ↓" : "OUTFLOW ↑"})`,
          from: src.rawAddress,
          to: tgt.rawAddress,
          value: e.value.toFixed(4),
          token: e.token,
          count: e.txCount,
        });
      });

      edgePath.addEventListener("mouseleave", () => {
        if (!pinnedNodeId) {
          resetHighlight();
          hidePathCallout();
        }
      });

      edgeGroup.appendChild(edgePath);

      // Clean, non-colliding pill for TOP primary flows only
      const isTopFlow = (isInflow && e === topInEdge && e.value > 0.1) || (!isInflow && e === topOutEdge && e.value > 0.1);
      if (isTopFlow && currentLayout === "flow") {
        const pillGroup = document.createElementNS(NS, "g");
        pillGroup.setAttribute("class", `key-flow-pill ${isInflow ? "pill-in" : "pill-out"}`);
        // Offset along curve (35% for inflow, 65% for outflow)
        const posX = isInflow ? src.x + (tgt.x - src.x) * 0.38 : src.x + (tgt.x - src.x) * 0.62;
        const posY = isInflow ? src.y + (tgt.y - src.y) * 0.38 - 12 : src.y + (tgt.y - src.y) * 0.62 - 12;

        const valText = `${e.value.toFixed(2)} ${e.token}`;
        const pillW = Math.max(58, valText.length * 7 + 14);

        const pillBg = document.createElementNS(NS, "rect");
        pillBg.setAttribute("x", posX - pillW / 2);
        pillBg.setAttribute("y", posY - 9);
        pillBg.setAttribute("width", pillW);
        pillBg.setAttribute("height", 18);
        pillBg.setAttribute("rx", 9);
        pillBg.setAttribute("class", "flow-pill-bg");

        const pillTxt = document.createElementNS(NS, "text");
        pillTxt.setAttribute("x", posX);
        pillTxt.setAttribute("y", posY + 3);
        pillTxt.setAttribute("class", "flow-pill-text");
        pillTxt.setAttribute("text-anchor", "middle");
        pillTxt.textContent = valText;

        pillGroup.appendChild(pillBg);
        pillGroup.appendChild(pillTxt);
        edgeGroup.appendChild(pillGroup);
      }
    });

    gViewport.appendChild(edgeGroup);

    // Layer 2: Nodes
    const nodeGroup = document.createElementNS(NS, "g");
    nodeGroup.setAttribute("class", "graph-nodes-layer");

    nodes.forEach((n) => {
      const g = document.createElementNS(NS, "g");
      g.setAttribute("class", `graph-node-item ${n.isRoot ? "node-root" : "node-counterparty"}`);
      g.setAttribute("data-node-id", n.id);
      g.setAttribute("transform", `translate(${n.x}, ${n.y})`);
      g.style.cursor = "pointer";

      const totalVol = n.totalIn + n.totalOut;
      const r = n.isRoot ? 22 : Math.min(16, Math.max(10, 8 + Math.log2(totalVol + 1) * 2));
      const isInflow = n.totalOut > 0 && n.totalIn === 0;
      const nodeColor = n.isRoot ? "#fbbf24" : n.vaspMatch ? "#38bdf8" : isInflow ? "#22c55e" : "#f97316";

      if (n.isRoot) {
        // Suspect Target Halos & Concentric Rings
        const haloRadar = document.createElementNS(NS, "circle");
        haloRadar.setAttribute("r", 34);
        haloRadar.setAttribute("fill", "none");
        haloRadar.setAttribute("stroke", "#f59e0b");
        haloRadar.setAttribute("stroke-width", "1");
        haloRadar.setAttribute("stroke-dasharray", "4 4");
        haloRadar.setAttribute("opacity", "0.4");
        haloRadar.setAttribute("class", "root-pulse-radar");
        g.appendChild(haloRadar);

        const outerGlow = document.createElementNS(NS, "circle");
        outerGlow.setAttribute("r", 26);
        outerGlow.setAttribute("fill", "rgba(245, 158, 11, 0.2)");
        outerGlow.setAttribute("filter", "url(#root-glow)");
        g.appendChild(outerGlow);
      }

      // Outer circle
      const circle = document.createElementNS(NS, "circle");
      circle.setAttribute("r", r);
      circle.setAttribute("fill", n.isRoot ? "#17140e" : "#0a0d14");
      circle.setAttribute("stroke", nodeColor);
      circle.setAttribute("stroke-width", n.isRoot ? "2.5" : "2");
      circle.setAttribute("class", "node-circle");
      g.appendChild(circle);

      // Inner dot
      const innerDot = document.createElementNS(NS, "circle");
      innerDot.setAttribute("r", n.isRoot ? 7 : 3.5);
      innerDot.setAttribute("fill", nodeColor);
      g.appendChild(innerDot);

      // Smart Outward Labels (Never overlap edges!)
      const labelGroup = document.createElementNS(NS, "g");
      labelGroup.setAttribute("class", "node-label-group");

      if (n.isRoot) {
        // Root Label placed cleanly centered below
        const title = document.createElementNS(NS, "text");
        title.setAttribute("y", r + 16);
        title.setAttribute("class", "node-text-label label-root-title");
        title.setAttribute("text-anchor", "middle");
        title.textContent = "SUSPECT TARGET";
        labelGroup.appendChild(title);

        const sub = document.createElementNS(NS, "text");
        sub.setAttribute("y", r + 28);
        sub.setAttribute("class", "node-sub-label label-root-sub");
        sub.setAttribute("text-anchor", "middle");
        sub.textContent = shortenAddress(n.rawAddress);
        labelGroup.appendChild(sub);
      } else {
        // Counterparty Label placed cleanly on the OUTSIDE
        const isLeftSide = n.x < dynamicWidth / 2;
        const textAnchor = currentLayout === "flow" 
          ? (isLeftSide ? "end" : "start")
          : (n.x < dynamicWidth / 2 ? "end" : "start");
        const offsetX = isLeftSide ? -(r + 10) : (r + 10);

        // Line 1: Address or VASP Hit
        const addrText = document.createElementNS(NS, "text");
        addrText.setAttribute("x", offsetX);
        addrText.setAttribute("y", -2);
        addrText.setAttribute("text-anchor", textAnchor);
        addrText.setAttribute("class", `node-text-label ${n.vaspMatch ? "label-vasp-hit" : ""}`);
        addrText.textContent = n.vaspMatch ? `◈ ${n.vaspMatch.toUpperCase()}` : shortenAddress(n.rawAddress);
        labelGroup.appendChild(addrText);

        // Line 2: Volume badge
        const volText = document.createElementNS(NS, "text");
        volText.setAttribute("x", offsetX);
        volText.setAttribute("y", 11);
        volText.setAttribute("text-anchor", textAnchor);
        volText.setAttribute("class", `node-sub-label ${isInflow ? "vol-in" : "vol-out"}`);
        const volAmt = isInflow ? n.totalOut : n.totalIn;
        // Issue 2 fix: clamp float display to 4 decimal places
        volText.textContent = `${isInflow ? "+" : "-"}${parseFloat(volAmt.toFixed(4))} ETH`;
        labelGroup.appendChild(volText);
      }

      g.appendChild(labelGroup);

      // Node Event Listeners
      g.addEventListener("mouseenter", () => {
        if (pinnedNodeId && pinnedNodeId !== n.id) return;
        highlightNode(n.id);
        updateInspector({
          title: n.isRoot ? "SUSPECT WALLET (TARGET)" : n.vaspMatch ? `IDENTIFIED VASP: ${n.vaspMatch}` : "COUNTERPARTY WALLET",
          address: n.rawAddress,
          role: n.isRoot ? "Investigation Target Root" : isInflow ? "Inflow Counterparty (Sender)" : "Outflow Counterparty (Receiver)",
          inflow: n.totalIn.toFixed(4),
          outflow: n.totalOut.toFixed(4),
          count: n.txCount,
          vasp: n.vaspMatch || "Unlabeled Intermediary",
          isPinned: pinnedNodeId === n.id,
        });
      });

      g.addEventListener("mouseleave", () => {
        if (!pinnedNodeId) {
          resetHighlight();
        }
      });

      g.addEventListener("click", (evt) => {
        evt.stopPropagation();
        if (pinnedNodeId === n.id) {
          pinnedNodeId = null;
          resetHighlight();
          hidePathCallout();
        } else {
          pinnedNodeId = n.id;
          highlightNode(n.id);
          updateInspector({
            title: n.isRoot ? "📌 PINNED: SUSPECT TARGET" : n.vaspMatch ? `📌 PINNED VASP: ${n.vaspMatch}` : "📌 PINNED COUNTERPARTY",
            address: n.rawAddress,
            role: n.isRoot ? "Investigation Target Root" : isInflow ? "Inflow Counterparty (Sender)" : "Outflow Counterparty (Receiver)",
            inflow: n.totalIn.toFixed(4),
            outflow: n.totalOut.toFixed(4),
            count: n.txCount,
            vasp: n.vaspMatch || "Unlabeled Intermediary",
            isPinned: true,
          });
        }
      });

      nodeGroup.appendChild(g);
    });

    gViewport.appendChild(nodeGroup);

    // Layer 3: Floating Callout Card for edge inspection
    const calloutG = document.createElementNS(NS, "g");
    calloutG.setAttribute("id", "graph-callout-overlay");
    calloutG.style.pointerEvents = "none";
    calloutG.style.opacity = "0";
    calloutG.style.transition = "opacity 0.2s ease";
    gViewport.appendChild(calloutG);
    activeTooltip = calloutG;

    svg.appendChild(gViewport);
    container.appendChild(svg);

    // Click outside nodes unpins selection
    svg.addEventListener("click", () => {
      pinnedNodeId = null;
      resetHighlight();
      hidePathCallout();
    });

    // Setup interactive Pan & Drag
    setupPanAndDrag(container, svg);

    // Apply current filter
    applyFilter(currentFilter);
  }

  // --- LAYOUT ENGINES ---

  function layoutFlowStages(inflowNodes, outflowNodes, mixedNodes, rootNode, width, height) {
    const headerOffset = 65;
    const footerOffset = 40;
    const usableHeight = height - headerOffset - footerOffset;

    // Anchor Root Suspect in Center
    rootNode.x = width / 2;
    rootNode.y = headerOffset + usableHeight / 2;

    // Inflows on the Left Stage
    const inCount = inflowNodes.length;
    if (inCount > 0) {
      const stepIn = usableHeight / (inCount + 1);
      inflowNodes.forEach((n, idx) => {
        const isStaggered = inCount > 8 && idx % 2 === 1;
        n.x = isStaggered ? width * 0.18 : width * 0.22;
        n.y = headerOffset + (idx + 1) * stepIn;
      });
    }

    // Outflows on the Right Stage
    const outCount = outflowNodes.length;
    if (outCount > 0) {
      const stepOut = usableHeight / (outCount + 1);
      outflowNodes.forEach((n, idx) => {
        const isStaggered = outCount > 8 && idx % 2 === 1;
        n.x = isStaggered ? width * 0.82 : width * 0.78;
        n.y = headerOffset + (idx + 1) * stepOut;
      });
    }

    // Mixed Nodes placed on top or bottom center
    mixedNodes.forEach((n, idx) => {
      n.x = width / 2 + (idx % 2 === 0 ? -90 : 90);
      n.y = headerOffset + 25;
    });
  }

  function layoutRadarOrbit(inflowNodes, outflowNodes, mixedNodes, rootNode, width, height) {
    rootNode.x = width / 2;
    rootNode.y = height / 2;

    const rx = Math.min(270, width * 0.36);
    const ry = Math.min(145, height * 0.36);

    function placeArc(nodeList, startAng, endAng) {
      if (!nodeList.length) return;
      if (nodeList.length === 1) {
        const mid = (startAng + endAng) / 2;
        nodeList[0].x = width / 2 + Math.cos(mid) * rx;
        nodeList[0].y = height / 2 + Math.sin(mid) * ry;
        return;
      }
      const step = (endAng - startAng) / (nodeList.length - 1);
      nodeList.forEach((n, idx) => {
        const ang = startAng + step * idx;
        n.x = width / 2 + Math.cos(ang) * rx;
        n.y = height / 2 + Math.sin(ang) * ry;
      });
    }

    // Inflows on left arc (125° to 235°)
    placeArc(inflowNodes, (125 * Math.PI) / 180, (235 * Math.PI) / 180);
    // Outflows on right arc (-55° to 55°)
    placeArc(outflowNodes, (-55 * Math.PI) / 180, (55 * Math.PI) / 180);
    // Mixed on top/bottom
    placeArc(mixedNodes, (70 * Math.PI) / 180, (110 * Math.PI) / 180);
  }

  // --- BACKGROUND & STAGE BANNERS ---

  function drawStageHeaders(parentG, NS, width, height, totalIn, totalOut, inCount, outCount, txCount, transactionsAnalysed) {
    const headerG = document.createElementNS(NS, "g");
    headerG.setAttribute("class", "stage-headers-layer");

    // Stage Column Background Tint Guides
    const leftCol = document.createElementNS(NS, "rect");
    leftCol.setAttribute("x", 16);
    leftCol.setAttribute("y", 16);
    leftCol.setAttribute("width", width * 0.32);
    leftCol.setAttribute("height", height - 32);
    leftCol.setAttribute("rx", 6);
    leftCol.setAttribute("fill", "rgba(34, 197, 94, 0.02)");
    leftCol.setAttribute("stroke", "rgba(34, 197, 94, 0.08)");
    leftCol.setAttribute("stroke-dasharray", "4 4");
    headerG.appendChild(leftCol);

    const rightCol = document.createElementNS(NS, "rect");
    rightCol.setAttribute("x", width * 0.68 - 16);
    rightCol.setAttribute("y", 16);
    rightCol.setAttribute("width", width * 0.32);
    rightCol.setAttribute("height", height - 32);
    rightCol.setAttribute("rx", 6);
    rightCol.setAttribute("fill", "rgba(245, 158, 11, 0.02)");
    rightCol.setAttribute("stroke", "rgba(245, 158, 11, 0.08)");
    rightCol.setAttribute("stroke-dasharray", "4 4");
    headerG.appendChild(rightCol);

    // Left Stage Header (Inflows)
    const inTitle = document.createElementNS(NS, "text");
    inTitle.setAttribute("x", width * 0.18);
    inTitle.setAttribute("y", 34);
    inTitle.setAttribute("class", "stage-title stage-inflow");
    inTitle.setAttribute("text-anchor", "middle");
    inTitle.textContent = "INFLOW SOURCES";
    headerG.appendChild(inTitle);

    const inSub = document.createElementNS(NS, "text");
    inSub.setAttribute("x", width * 0.18);
    inSub.setAttribute("y", 48);
    inSub.setAttribute("class", "stage-subtitle");
    inSub.setAttribute("text-anchor", "middle");
    inSub.textContent = `↓ ${parseFloat(totalIn.toFixed(4))} ETH · ${inCount} senders`;
    headerG.appendChild(inSub);

    // Center Stage Header (Suspect Hub)
    const midTitle = document.createElementNS(NS, "text");
    midTitle.setAttribute("x", width / 2);
    midTitle.setAttribute("y", 34);
    midTitle.setAttribute("class", "stage-title stage-target");
    midTitle.setAttribute("text-anchor", "middle");
    midTitle.textContent = "SUSPECT WALLET";
    headerG.appendChild(midTitle);

    const midSub = document.createElementNS(NS, "text");
    midSub.setAttribute("x", width / 2);
    midSub.setAttribute("y", 48);
    midSub.setAttribute("class", "stage-subtitle");
    midSub.setAttribute("text-anchor", "middle");
    // Issue 3 fix: clarify the difference between displayed and analysed counts
    if (transactionsAnalysed && transactionsAnalysed > txCount) {
      midSub.textContent = `◈ SHOWING ${txCount} OF ${transactionsAnalysed} TRANSFERS`;
    } else {
      midSub.textContent = `◈ ${txCount} Indexed Transfers`;
    }
    headerG.appendChild(midSub);

    // Right Stage Header (Outflows)
    const outTitle = document.createElementNS(NS, "text");
    outTitle.setAttribute("x", width * 0.82);
    outTitle.setAttribute("y", 34);
    outTitle.setAttribute("class", "stage-title stage-outflow");
    outTitle.setAttribute("text-anchor", "middle");
    outTitle.textContent = "OUTFLOW DESTINATIONS";
    headerG.appendChild(outTitle);

    const outSub = document.createElementNS(NS, "text");
    outSub.setAttribute("x", width * 0.82);
    outSub.setAttribute("y", 48);
    outSub.setAttribute("class", "stage-subtitle");
    outSub.setAttribute("text-anchor", "middle");
    outSub.textContent = `↑ ${parseFloat(totalOut.toFixed(4))} ETH · ${outCount} receivers`;
    headerG.appendChild(outSub);

    parentG.appendChild(headerG);
  }

  function drawRadarRings(parentG, NS, width, height) {
    const orbitG = document.createElementNS(NS, "g");
    orbitG.setAttribute("class", "radar-grid-rings");
    const rx = Math.min(270, width * 0.36);
    const ry = Math.min(145, height * 0.36);
    [ry * 0.45, ry * 0.8, rx].forEach((rad, idx) => {
      const ring = document.createElementNS(NS, "ellipse");
      ring.setAttribute("cx", width / 2);
      ring.setAttribute("cy", height / 2);
      ring.setAttribute("rx", rad);
      ring.setAttribute("ry", rad * (ry / rx));
      ring.setAttribute("fill", "none");
      ring.setAttribute("stroke", "rgba(245, 158, 11, 0.07)");
      ring.setAttribute("stroke-width", "1");
      ring.setAttribute("stroke-dasharray", idx % 2 === 0 ? "4 6" : "2 4");
      orbitG.appendChild(ring);
    });
    parentG.appendChild(orbitG);
  }

  // --- INTERACTION & HIGHLIGHTING ---

  function highlightNode(nodeId) {
    const svg = cachedContainer?.querySelector("svg");
    if (!svg) return;
    const paths = svg.querySelectorAll(".graph-edge-path");
    paths.forEach((p) => {
      const s = p.getAttribute("data-source");
      const t = p.getAttribute("data-target");
      if (s === nodeId || t === nodeId) {
        p.setAttribute("stroke-opacity", "1");
        p.setAttribute("stroke-width", "3.8");
        p.classList.add("edge-active-flow");
      } else {
        p.setAttribute("stroke-opacity", "0.1");
        p.classList.remove("edge-active-flow");
      }
    });

    const nodeItems = svg.querySelectorAll(".graph-node-item");
    nodeItems.forEach((item) => {
      const nid = item.getAttribute("data-node-id");
      if (nid === nodeId) {
        item.style.opacity = "1";
      } else {
        item.style.opacity = "0.35";
      }
    });
  }

  function highlightEdge(edgeKey, srcId, tgtId) {
    const svg = cachedContainer?.querySelector("svg");
    if (!svg) return;
    const paths = svg.querySelectorAll(".graph-edge-path");
    paths.forEach((p) => {
      if (p.getAttribute("data-edgekey") === edgeKey) {
        p.setAttribute("stroke-opacity", "1");
        p.setAttribute("stroke-width", "4.2");
        p.classList.add("edge-active-flow");
      } else {
        p.setAttribute("stroke-opacity", "0.1");
        p.classList.remove("edge-active-flow");
      }
    });

    const nodeItems = svg.querySelectorAll(".graph-node-item");
    nodeItems.forEach((item) => {
      const nid = item.getAttribute("data-node-id");
      if (nid === srcId || nid === tgtId) {
        item.style.opacity = "1";
      } else {
        item.style.opacity = "0.35";
      }
    });
  }

  function resetHighlight() {
    const svg = cachedContainer?.querySelector("svg");
    if (!svg) return;
    const paths = svg.querySelectorAll(".graph-edge-path");
    paths.forEach((p) => {
      p.setAttribute("stroke-opacity", "0.65");
      p.setAttribute("stroke-width", Math.min(4.2, Math.max(1.8, Math.log10(2) * 2.2)));
      p.classList.remove("edge-active-flow");
    });
    const nodeItems = svg.querySelectorAll(".graph-node-item");
    nodeItems.forEach((item) => (item.style.opacity = "1"));
    applyFilter(currentFilter);
  }

  function showPathCallout(e, isInflow, src, tgt, x, y) {
    if (!activeTooltip) return;
    activeTooltip.innerHTML = "";

    const textStr = `${isInflow ? "INFLOW" : "OUTFLOW"}: ${e.value.toFixed(4)} ${e.token} (${e.txCount} tx)`;
    const textWidth = Math.max(160, textStr.length * 6.5 + 20);

    const NS = "http://www.w3.org/2000/svg";
    const bg = document.createElementNS(NS, "rect");
    bg.setAttribute("x", x - textWidth / 2);
    bg.setAttribute("y", y - 13);
    bg.setAttribute("width", textWidth);
    bg.setAttribute("height", 24);
    bg.setAttribute("rx", 12);
    bg.setAttribute("class", `callout-card-bg ${isInflow ? "callout-in" : "callout-out"}`);

    const txt = document.createElementNS(NS, "text");
    txt.setAttribute("x", x);
    txt.setAttribute("y", y + 3);
    txt.setAttribute("class", "callout-card-text");
    txt.setAttribute("text-anchor", "middle");
    txt.textContent = textStr;

    activeTooltip.appendChild(bg);
    activeTooltip.appendChild(txt);
    activeTooltip.style.opacity = "1";
  }

  function hidePathCallout() {
    if (activeTooltip) {
      activeTooltip.style.opacity = "0";
    }
  }

  function applyFilter(filter) {
    currentFilter = filter;
    const svg = cachedContainer?.querySelector("svg");
    if (!svg) return;

    const inPaths = svg.querySelectorAll(".edge-inflow");
    const outPaths = svg.querySelectorAll(".edge-outflow");

    if (filter === "all") {
      inPaths.forEach((p) => (p.style.display = "block"));
      outPaths.forEach((p) => (p.style.display = "block"));
    } else if (filter === "in") {
      inPaths.forEach((p) => (p.style.display = "block"));
      outPaths.forEach((p) => (p.style.display = "none"));
    } else if (filter === "out") {
      inPaths.forEach((p) => (p.style.display = "none"));
      outPaths.forEach((p) => (p.style.display = "block"));
    }
  }

  function updateInspector(data) {
    const details = document.getElementById("inspector-details");
    const badge = document.getElementById("inspector-badge");
    if (!details) return;

    if (badge && data.title) {
      badge.textContent = data.title;
      if (data.isPinned) {
        badge.classList.add("badge-pinned");
      } else {
        badge.classList.remove("badge-pinned");
      }
    }

    if (data.address) {
      details.innerHTML = `
        <div class="inspect-row">
          <span class="inspect-label">ADDR:</span>
          <code class="inspect-addr">${data.address}</code>
          <button type="button" class="inspect-copy-btn" title="Copy address" onclick="navigator.clipboard.writeText('${data.address}')">COPY</button>
          <span class="inspect-pill">${data.vasp || data.role}</span>
          ${data.isPinned ? '<span class="inspect-unpin-hint">(Click node again to unpin)</span>' : ''}
        </div>
        <div class="inspect-metrics">
          <span>Inflow: <strong>${data.inflow} Ξ</strong></span>
          <span>Outflow: <strong>${data.outflow} Ξ</strong></span>
          <span>Transfers: <strong>${data.count} tx</strong></span>
        </div>
      `;
    } else if (data.from) {
      details.innerHTML = `
        <div class="inspect-row">
          <span class="inspect-flow-dir">${shortenAddress(data.from)} ➔ ${shortenAddress(data.to)}</span>
          <strong class="inspect-val">${data.value} ${data.token}</strong>
          <span class="inspect-pill">${data.count} txns</span>
        </div>
      `;
    }
  }

  function shortenAddress(addr) {
    if (!addr || addr.length < 12) return addr || "";
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  }

  function setupPanAndDrag(container, svg) {
    let isDragging = false;
    let startX = 0;
    let startY = 0;

    svg.addEventListener("mousedown", (e) => {
      if (e.target.tagName === "circle" || e.target.tagName === "text" || e.target.tagName === "button") return;
      isDragging = true;
      startX = e.clientX - currentPan.x;
      startY = e.clientY - currentPan.y;
      svg.style.cursor = "grabbing";
    });

    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      currentPan.x = e.clientX - startX;
      currentPan.y = e.clientY - startY;
      updateTransform();
    });

    window.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        svg.style.cursor = "default";
      }
    });
  }

  // --- TOOLBAR CONTROLS ---

  window.Graph.initToolbar = function () {
    // Layout switcher
    document.querySelectorAll(".graph-layout-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".graph-layout-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        currentLayout = btn.getAttribute("data-layout");
        render();
      });
    });

    // Direction filters
    document.querySelectorAll(".graph-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".graph-filter-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        applyFilter(btn.getAttribute("data-filter"));
      });
    });

    // Zoom controls
    const btnZoomIn = document.getElementById("graph-zoom-in");
    const btnZoomOut = document.getElementById("graph-zoom-out");
    const btnZoomReset = document.getElementById("graph-zoom-reset");

    if (btnZoomIn) {
      btnZoomIn.addEventListener("click", () => {
        currentZoom = Math.min(2.5, currentZoom + 0.2);
        updateTransform();
      });
    }
    if (btnZoomOut) {
      btnZoomOut.addEventListener("click", () => {
        currentZoom = Math.max(0.5, currentZoom - 0.2);
        updateTransform();
      });
    }
    if (btnZoomReset) {
      btnZoomReset.addEventListener("click", () => {
        currentZoom = 1;
        currentPan = { x: 0, y: 0 };
        updateTransform();
      });
    }
  };

  function updateTransform() {
    const vp = document.getElementById("graph-viewport");
    if (vp) {
      vp.setAttribute("transform", `translate(${currentPan.x}, ${currentPan.y}) scale(${currentZoom})`);
    }
  }
})();
