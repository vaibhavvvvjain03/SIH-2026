/** 
 * Interactive SVG transaction graph — BRIGHT & PROFESSIONAL edition.
 * Same transaction contract, dramatically upgraded visual presentation.
 * - Bright neon-ember edges with animated glow
 * - Gradient-filled nodes with halos  
 * - Hover tooltips with transaction details
 * - Arrow markers with proper visibility
 */
window.Graph = window.Graph || {};

window.Graph.renderTransactionGraph = function (container, { rootAddress, transactions, vaspNames }) {
  container.innerHTML = "";
  const width = container.clientWidth || 700;
  const height = 390;
  const nodeMap = new Map();

  function getNode(addr) {
    if (!nodeMap.has(addr)) {
      nodeMap.set(addr, {
        id: addr,
        isRoot: addr?.toLowerCase() === rootAddress?.toLowerCase(),
        x: width / 2 + (Math.random() - 0.5) * 150,
        y: height / 2 + (Math.random() - 0.5) * 130,
        vx: 0,
        vy: 0,
      });
    }
    return nodeMap.get(addr);
  }

  const edges = [];
  transactions.forEach((tx) => {
    getNode(tx.from);
    getNode(tx.to);
    edges.push({
      source: tx.from,
      target: tx.to,
      value: tx.value,
      hash: tx.tx_hash,
      token: tx.token,
    });
  });

  const nodes = [...nodeMap.values()];
  if (!nodes.length) {
    container.innerHTML = '<p class="empty-state">No transaction graph available for this wallet.</p>';
    return;
  }

  // Force-directed layout simulation
  const center = { x: width / 2, y: height / 2 };
  for (let tick = 0; tick < 180; tick++) {
    nodes.forEach((a) => {
      let fx = (center.x - a.x) * 0.012;
      let fy = (center.y - a.y) * 0.012;
      nodes.forEach((b) => {
        if (a === b) return;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = Math.max(dx * dx + dy * dy, 1);
        const force = 800 / d2;
        fx += (dx / Math.sqrt(d2)) * force;
        fy += (dy / Math.sqrt(d2)) * force;
      });
      a.vx = (a.vx + fx) * 0.59;
      a.vy = (a.vy + fy) * 0.59;
    });
    edges.forEach((e) => {
      const a = nodeMap.get(e.source);
      const b = nodeMap.get(e.target);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const diff = (dist - 105) * 0.018;
      const nx = (dx / dist) * diff;
      const ny = (dy / dist) * diff;
      a.vx += nx;
      a.vy += ny;
      b.vx -= nx;
      b.vy -= ny;
    });
    nodes.forEach((a) => {
      a.x = Math.max(35, Math.min(width - 35, a.x + a.vx));
      a.y = Math.max(35, Math.min(height - 35, a.y + a.vy));
    });
  }

  // Create SVG
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "graph-svg");

  // Defs — gradients, filters, markers
  const defs = document.createElementNS(NS, "defs");

  // Arrow marker — bright orange, clearly visible
  const marker = document.createElementNS(NS, "marker");
  marker.setAttribute("id", "arrow");
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "9");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "5");
  marker.setAttribute("markerHeight", "5");
  marker.setAttribute("orient", "auto-start-reverse");
  const arrowPath = document.createElementNS(NS, "path");
  arrowPath.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  arrowPath.setAttribute("fill", "#e8a050");
  marker.appendChild(arrowPath);
  defs.appendChild(marker);

  // Glow filter for edges
  const edgeGlow = document.createElementNS(NS, "filter");
  edgeGlow.setAttribute("id", "edge-glow");
  edgeGlow.setAttribute("x", "-20%");
  edgeGlow.setAttribute("y", "-20%");
  edgeGlow.setAttribute("width", "140%");
  edgeGlow.setAttribute("height", "140%");
  const blur1 = document.createElementNS(NS, "feGaussianBlur");
  blur1.setAttribute("stdDeviation", "2");
  blur1.setAttribute("result", "blur");
  const merge1 = document.createElementNS(NS, "feMerge");
  const mn1 = document.createElementNS(NS, "feMergeNode");
  mn1.setAttribute("in", "blur");
  const mn2 = document.createElementNS(NS, "feMergeNode");
  mn2.setAttribute("in", "SourceGraphic");
  merge1.appendChild(mn1);
  merge1.appendChild(mn2);
  edgeGlow.appendChild(blur1);
  edgeGlow.appendChild(merge1);
  defs.appendChild(edgeGlow);

  // Glow filter for root node
  const nodeGlow = document.createElementNS(NS, "filter");
  nodeGlow.setAttribute("id", "node-glow");
  nodeGlow.setAttribute("x", "-50%");
  nodeGlow.setAttribute("y", "-50%");
  nodeGlow.setAttribute("width", "200%");
  nodeGlow.setAttribute("height", "200%");
  const blur2 = document.createElementNS(NS, "feGaussianBlur");
  blur2.setAttribute("stdDeviation", "4");
  blur2.setAttribute("result", "blur");
  const merge2 = document.createElementNS(NS, "feMerge");
  const mn3 = document.createElementNS(NS, "feMergeNode");
  mn3.setAttribute("in", "blur");
  const mn4 = document.createElementNS(NS, "feMergeNode");
  mn4.setAttribute("in", "SourceGraphic");
  merge2.appendChild(mn3);
  merge2.appendChild(mn4);
  nodeGlow.appendChild(blur2);
  nodeGlow.appendChild(merge2);
  defs.appendChild(nodeGlow);

  // Edge gradient
  const edgeGrad = document.createElementNS(NS, "linearGradient");
  edgeGrad.setAttribute("id", "edgeGradient");
  const stop1 = document.createElementNS(NS, "stop");
  stop1.setAttribute("offset", "0%");
  stop1.setAttribute("stop-color", "#f1b86c");
  const stop2 = document.createElementNS(NS, "stop");
  stop2.setAttribute("offset", "100%");
  stop2.setAttribute("stop-color", "#d8893f");
  edgeGrad.appendChild(stop1);
  edgeGrad.appendChild(stop2);
  defs.appendChild(edgeGrad);

  // Root node radial gradient
  const rootGrad = document.createElementNS(NS, "radialGradient");
  rootGrad.setAttribute("id", "rootGrad");
  const rs1 = document.createElementNS(NS, "stop");
  rs1.setAttribute("offset", "0%");
  rs1.setAttribute("stop-color", "#ffb347");
  const rs2 = document.createElementNS(NS, "stop");
  rs2.setAttribute("offset", "60%");
  rs2.setAttribute("stop-color", "#d8893f");
  const rs3 = document.createElementNS(NS, "stop");
  rs3.setAttribute("offset", "100%");
  rs3.setAttribute("stop-color", "#a05a1a");
  rootGrad.appendChild(rs1);
  rootGrad.appendChild(rs2);
  rootGrad.appendChild(rs3);
  defs.appendChild(rootGrad);

  // Regular node gradient
  const nodeGrad = document.createElementNS(NS, "radialGradient");
  nodeGrad.setAttribute("id", "nodeGrad");
  const ns1 = document.createElementNS(NS, "stop");
  ns1.setAttribute("offset", "0%");
  ns1.setAttribute("stop-color", "#3a3530");
  const ns2 = document.createElementNS(NS, "stop");
  ns2.setAttribute("offset", "100%");
  ns2.setAttribute("stop-color", "#1a1816");
  nodeGrad.appendChild(ns1);
  nodeGrad.appendChild(ns2);
  defs.appendChild(nodeGrad);

  svg.appendChild(defs);

  // Draw edges — BRIGHT and visible
  edges.forEach((e, i) => {
    const a = nodeMap.get(e.source);
    const b = nodeMap.get(e.target);

    // Glow line (behind, thicker, blurred)
    const glowLine = document.createElementNS(NS, "line");
    glowLine.setAttribute("x1", a.x);
    glowLine.setAttribute("y1", a.y);
    glowLine.setAttribute("x2", b.x);
    glowLine.setAttribute("y2", b.y);
    glowLine.setAttribute("stroke", "#d8893f");
    glowLine.setAttribute("stroke-width", "3");
    glowLine.setAttribute("opacity", "0.25");
    glowLine.setAttribute("filter", "url(#edge-glow)");
    svg.appendChild(glowLine);

    // Main edge line
    const line = document.createElementNS(NS, "line");
    line.setAttribute("x1", a.x);
    line.setAttribute("y1", a.y);
    line.setAttribute("x2", b.x);
    line.setAttribute("y2", b.y);
    line.setAttribute("class", "graph-edge");
    line.setAttribute("marker-end", "url(#arrow)");
    line.style.animationDelay = `${i * 45}ms`;

    const title = document.createElementNS(NS, "title");
    title.textContent = `${e.value} ${e.token} — ${e.hash}`;
    line.appendChild(title);
    svg.appendChild(line);
  });

  // Draw nodes
  nodes.forEach((n, i) => {
    const g = document.createElementNS(NS, "g");
    g.setAttribute("transform", `translate(${n.x},${n.y})`);
    g.style.animation = `nodeReveal .6s ${i * 50}ms both`;

    if (n.isRoot) {
      // Root node outer halo
      const halo = document.createElementNS(NS, "circle");
      halo.setAttribute("r", 22);
      halo.setAttribute("fill", "none");
      halo.setAttribute("stroke", "#d8893f");
      halo.setAttribute("stroke-width", "0.5");
      halo.setAttribute("opacity", "0.35");
      halo.setAttribute("stroke-dasharray", "3 3");
      halo.style.animation = "orbit 8s linear infinite";
      g.appendChild(halo);

      // Root node glow circle
      const glow = document.createElementNS(NS, "circle");
      glow.setAttribute("r", 16);
      glow.setAttribute("fill", "url(#rootGrad)");
      glow.setAttribute("opacity", "0.3");
      glow.setAttribute("filter", "url(#node-glow)");
      g.appendChild(glow);
    }

    // Main circle
    const circle = document.createElementNS(NS, "circle");
    circle.setAttribute("r", n.isRoot ? 14 : 8);
    if (n.isRoot) {
      circle.setAttribute("fill", "url(#rootGrad)");
      circle.setAttribute("stroke", "#f1c38c");
      circle.setAttribute("stroke-width", "2");
      circle.setAttribute("class", "graph-node graph-node--root");
    } else {
      circle.setAttribute("fill", "url(#nodeGrad)");
      circle.setAttribute("stroke", "#c08040");
      circle.setAttribute("stroke-width", "1.5");
      circle.setAttribute("class", "graph-node");
    }
    g.appendChild(circle);

    // Label
    const label = document.createElementNS(NS, "text");
    label.setAttribute("class", "graph-node-label");
    label.setAttribute("y", n.isRoot ? -22 : -14);
    label.textContent = n.isRoot ? "SUSPECT" : shortenAddress(n.id);
    g.appendChild(label);

    // Hover title
    const title = document.createElementNS(NS, "title");
    title.textContent = n.id;
    g.appendChild(title);

    svg.appendChild(g);
  });

  container.appendChild(svg);
};

function shortenAddress(addr) {
  if (!addr || addr.length < 12) return addr || "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
