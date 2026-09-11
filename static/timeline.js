/**
 * timeline.js — Chronicle Transaction Timeline & Flow Feed.
 * Production-grade blockchain intelligence visualizer.
 * - Interactive multi-layer time chart with formatted time axis & gridlines
 * - Flow statistics strip (volume in/out, net flow, time range)
 * - Interactive filter tabs (ALL / SENT / RECEIVED)
 * - Chronicle Event Feed cards linked bi-directionally with chart nodes
 */
window.Timeline = window.Timeline || {};

window.Timeline.renderTimeline = function (container, { rootAddress, transactions }) {
  container.innerHTML = "";

  if (!transactions?.length) {
    container.innerHTML = '<p class="empty-state">No transactions recorded for this wallet in the queried block range.</p>';
    return;
  }

  // Sort chronologically
  const sorted = [...transactions].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const root = (rootAddress || "").toLowerCase();

  // Compute metrics
  let totalSent = 0;
  let totalReceived = 0;
  let sentCount = 0;
  let receivedCount = 0;

  sorted.forEach((tx) => {
    const isOut = tx.from?.toLowerCase() === root;
    const val = Number(tx.value) || 0;
    if (isOut) {
      totalSent += val;
      sentCount++;
    } else {
      totalReceived += val;
      receivedCount++;
    }
  });

  const firstTime = new Date(sorted[0].timestamp);
  const lastTime = new Date(sorted[sorted.length - 1].timestamp);
  const timeSpanHours = Math.max(1, Math.round((lastTime - firstTime) / (1000 * 60 * 60)));

  // 1. STATS STRIP
  const statsBar = document.createElement("div");
  statsBar.className = "timeline-stats-bar";
  statsBar.innerHTML = `
    <div class="timeline-stat-item">
      <span class="timeline-stat-label">RECORDED FLOW</span>
      <strong class="timeline-stat-val">${sorted.length} <small>EVENTS</small></strong>
    </div>
    <div class="timeline-stat-item">
      <span class="timeline-stat-label">TOTAL OUTFLOW</span>
      <strong class="timeline-stat-val val--out">-${totalSent.toFixed(2)} <small>VAL</small></strong>
    </div>
    <div class="timeline-stat-item">
      <span class="timeline-stat-label">TOTAL INFLOW</span>
      <strong class="timeline-stat-val val--in">+${totalReceived.toFixed(2)} <small>VAL</small></strong>
    </div>
    <div class="timeline-stat-item timeline-stat-item--span">
      <span class="timeline-stat-label">CHRONICLE WINDOW</span>
      <strong class="timeline-stat-val val--span">${timeSpanHours}h <small>DURATION</small></strong>
    </div>
    <div class="timeline-filter-tabs" role="tablist">
      <button type="button" class="tab-btn active" data-filter="all">ALL (${sorted.length})</button>
      <button type="button" class="tab-btn" data-filter="out">SENT (${sentCount})</button>
      <button type="button" class="tab-btn" data-filter="in">RECEIVED (${receivedCount})</button>
    </div>
  `;
  container.appendChild(statsBar);

  // 2. CHART CONTAINER & TOOLTIP
  const chartWrapper = document.createElement("div");
  chartWrapper.className = "timeline-chart-wrapper";

  const tooltip = document.createElement("div");
  tooltip.className = "timeline-tooltip";
  chartWrapper.appendChild(tooltip);

  const width = container.clientWidth || 800;
  const height = 180;
  const pad = { top: 28, right: 28, bottom: 40, left: 36 };

  const times = sorted.map((t) => new Date(t.timestamp).getTime());
  const values = sorted.map((t) => Number(t.value) || 0);
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const maxV = Math.max(...values, 0.0001);

  const getX = (t) => pad.left + ((t - minT) / Math.max(maxT - minT, 1)) * (width - pad.left - pad.right);
  const getY = (v) => height - pad.bottom - (v / maxV) * (height - pad.top - pad.bottom);

  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "timeline-svg");

  // Defs & Gradients
  const defs = document.createElementNS(NS, "defs");

  const filterOut = document.createElementNS(NS, "filter");
  filterOut.setAttribute("id", "glow-out");
  filterOut.innerHTML = '<feGaussianBlur stdDeviation="3" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>';
  defs.appendChild(filterOut);

  const filterIn = document.createElementNS(NS, "filter");
  filterIn.setAttribute("id", "glow-in");
  filterIn.innerHTML = '<feGaussianBlur stdDeviation="3" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>';
  defs.appendChild(filterIn);

  svg.appendChild(defs);

  // Time gridlines & axis labels (4 evenly spaced intervals)
  const stepCount = 4;
  for (let s = 0; s <= stepCount; s++) {
    const tVal = minT + (s / stepCount) * (maxT - minT);
    const xPos = getX(tVal);

    // Vertical faint guide
    const gridLine = document.createElementNS(NS, "line");
    gridLine.setAttribute("x1", xPos);
    gridLine.setAttribute("y1", pad.top - 8);
    gridLine.setAttribute("x2", xPos);
    gridLine.setAttribute("y2", height - pad.bottom);
    gridLine.setAttribute("class", "timeline-gridline");
    svg.appendChild(gridLine);

    // Time label on axis
    const d = new Date(tVal);
    const timeStr = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
    const text = document.createElementNS(NS, "text");
    text.setAttribute("x", xPos);
    text.setAttribute("y", height - pad.bottom + 18);
    text.setAttribute("class", "timeline-axis-label");
    text.setAttribute("text-anchor", s === 0 ? "start" : s === stepCount ? "end" : "middle");
    text.textContent = timeStr;
    svg.appendChild(text);
  }

  // Base Axis Line
  const base = document.createElementNS(NS, "line");
  base.setAttribute("x1", pad.left);
  base.setAttribute("y1", height - pad.bottom);
  base.setAttribute("x2", width - pad.right);
  base.setAttribute("y2", height - pad.bottom);
  base.setAttribute("class", "timeline-axis");
  svg.appendChild(base);

  // Render stems and points
  const dotElements = [];

  sorted.forEach((tx, i) => {
    const isOut = tx.from?.toLowerCase() === root;
    const txTime = new Date(tx.timestamp).getTime();
    const cx = getX(txTime);
    const cy = getY(tx.value);
    const dirClass = isOut ? "out" : "in";

    const group = document.createElementNS(NS, "g");
    group.setAttribute("class", `timeline-item-group group--${dirClass}`);
    group.setAttribute("data-index", i);

    // Stem line
    const stem = document.createElementNS(NS, "line");
    stem.setAttribute("x1", cx);
    stem.setAttribute("y1", height - pad.bottom);
    stem.setAttribute("x2", cx);
    stem.setAttribute("y2", cy);
    stem.setAttribute("class", `timeline-stem timeline-stem--${dirClass}`);
    stem.style.animationDelay = `${i * 35}ms`;
    group.appendChild(stem);

    // Halo pulse ring
    const halo = document.createElementNS(NS, "circle");
    halo.setAttribute("cx", cx);
    halo.setAttribute("cy", cy);
    halo.setAttribute("r", 8);
    halo.setAttribute("class", `timeline-halo timeline-halo--${dirClass}`);
    group.appendChild(halo);

    // Main Dot
    const dot = document.createElementNS(NS, "circle");
    dot.setAttribute("cx", cx);
    dot.setAttribute("cy", cy);
    dot.setAttribute("r", 5);
    dot.setAttribute("class", `timeline-dot timeline-dot--${dirClass}`);
    dot.setAttribute("filter", `url(#glow-${dirClass})`);
    dot.style.animationDelay = `${i * 35 + 80}ms`;
    group.appendChild(dot);

    // Hover interactions
    group.addEventListener("mouseenter", (e) => {
      highlightEvent(i, true);
      showTooltip(tx, isOut, cx, cy);
    });

    group.addEventListener("mouseleave", () => {
      clearHighlight();
      hideTooltip();
    });

    svg.appendChild(group);
    dotElements.push(group);
  });

  chartWrapper.appendChild(svg);
  container.appendChild(chartWrapper);

  // 3. CHRONICLE FLOW FEED (Cards Stream)
  const feedTitle = document.createElement("div");
  feedTitle.className = "timeline-feed-header";
  feedTitle.innerHTML = `
    <div class="timeline-feed-title-wrap">
      <span>TRANSACTION CHRONICLE STREAM</span>
      <small>ordered chronologically · manual scroll & drag supported</small>
    </div>
    <div class="timeline-feed-nav">
      <button type="button" class="feed-nav-btn feed-nav-prev" aria-label="Scroll stream earlier" title="Scroll left">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
      </button>
      <button type="button" class="feed-nav-btn feed-nav-next" aria-label="Scroll stream later" title="Scroll right">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </button>
    </div>
  `;
  container.appendChild(feedTitle);

  const feedContainer = document.createElement("div");
  feedContainer.className = "timeline-feed";

  const cardElements = [];

  sorted.forEach((tx, i) => {
    const isOut = tx.from?.toLowerCase() === root;
    const card = document.createElement("div");
    card.className = `chronicle-card card--${isOut ? "out" : "in"}`;
    card.setAttribute("data-index", i);
    card.setAttribute("data-type", isOut ? "out" : "in");

    const dateObj = new Date(tx.timestamp);
    const dateFormatted = dateObj.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const timeFormatted = dateObj.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const counterparty = isOut ? tx.to : tx.from;

    card.innerHTML = `
      <div class="chronicle-card-top">
        <span class="chronicle-badge badge--${isOut ? "out" : "in"}">
          ${isOut ? "↗ SENT" : "↙ RECEIVED"}
        </span>
        <span class="chronicle-time">${dateFormatted} · ${timeFormatted}</span>
      </div>
      <div class="chronicle-val">
        <strong>${isOut ? "-" : "+"}${tx.value}</strong>
        <span class="chronicle-token">${escapeHtml(tx.token || "ETH")}</span>
      </div>
      <div class="chronicle-meta">
        <div class="chronicle-addr" title="${counterparty}">
          <small>${isOut ? "TO:" : "FROM:"}</small> ${shortenAddress(counterparty)}
        </div>
        <div class="chronicle-hash" title="${tx.tx_hash}">
          <small>TX:</small> ${shortenAddress(tx.tx_hash)}
        </div>
      </div>
    `;

    card.addEventListener("mouseenter", () => {
      // Never trigger scrollIntoView when hovering cards inside the feed itself
      highlightEvent(i, false);
      const isOutDir = isOut;
      const txTime = new Date(tx.timestamp).getTime();
      showTooltip(tx, isOutDir, getX(txTime), getY(tx.value));
    });

    card.addEventListener("mouseleave", () => {
      clearHighlight();
      hideTooltip();
    });

    feedContainer.appendChild(card);
    cardElements.push(card);
  });

  container.appendChild(feedContainer);

  // Manual navigation buttons
  const prevBtn = feedTitle.querySelector(".feed-nav-prev");
  const nextBtn = feedTitle.querySelector(".feed-nav-next");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      feedContainer.scrollBy({ left: -360, behavior: "smooth" });
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      feedContainer.scrollBy({ left: 360, behavior: "smooth" });
    });
  }

  // Smooth mouse drag-to-scroll
  let isDown = false;
  let startX = 0;
  let scrollStart = 0;

  feedContainer.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    isDown = true;
    feedContainer.classList.add("is-dragging");
    startX = e.pageX - feedContainer.offsetLeft;
    scrollStart = feedContainer.scrollLeft;
  });

  window.addEventListener("mouseup", () => {
    if (isDown) {
      isDown = false;
      feedContainer.classList.remove("is-dragging");
    }
  });

  feedContainer.addEventListener("mouseleave", () => {
    if (isDown) {
      isDown = false;
      feedContainer.classList.remove("is-dragging");
    }
  });

  feedContainer.addEventListener("mousemove", (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - feedContainer.offsetLeft;
    const walk = (x - startX) * 1.3;
    feedContainer.scrollLeft = scrollStart - walk;
  });

  // Helper: Tooltip
  function showTooltip(tx, isOut, x, y) {
    const d = new Date(tx.timestamp);
    tooltip.innerHTML = `
      <div class="tt-header">
        <span class="tt-badge ${isOut ? "out" : "in"}">${isOut ? "OUTFLOW ↗" : "INFLOW ↙"}</span>
        <span class="tt-time">${d.toLocaleString()}</span>
      </div>
      <div class="tt-val">${isOut ? "-" : "+"}${tx.value} ${tx.token || "ETH"}</div>
      <div class="tt-detail"><span>${isOut ? "Recipient:" : "Sender:"}</span> <code>${shortenAddress(isOut ? tx.to : tx.from)}</code></div>
      <div class="tt-detail"><span>Tx Hash:</span> <code>${shortenAddress(tx.tx_hash)}</code></div>
    `;
    tooltip.style.left = `${Math.min(width - 240, Math.max(10, x - 110))}px`;
    tooltip.style.top = `${Math.max(10, y - 90)}px`;
    tooltip.classList.add("visible");
  }

  function hideTooltip() {
    tooltip.classList.remove("visible");
  }

  // Helper: Highlight linked event
  function highlightEvent(index, scrollToCard = false) {
    dotElements.forEach((g, i) => {
      if (i === index) {
        g.classList.add("active");
      } else {
        g.classList.add("dimmed");
      }
    });

    cardElements.forEach((c, i) => {
      if (i === index) {
        c.classList.add("active");
        if (scrollToCard) {
          const cardRect = c.getBoundingClientRect();
          const feedRect = feedContainer.getBoundingClientRect();
          if (cardRect.left < feedRect.left || cardRect.right > feedRect.right) {
            c.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
          }
        }
      } else {
        c.classList.add("dimmed");
      }
    });
  }

  function clearHighlight() {
    dotElements.forEach((g) => g.classList.remove("active", "dimmed"));
    cardElements.forEach((c) => c.classList.remove("active", "dimmed"));
  }

  // Filter Tabs Handler
  const tabButtons = statsBar.querySelectorAll(".tab-btn");
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const filter = btn.getAttribute("data-filter");

      dotElements.forEach((g, i) => {
        const isOut = sorted[i].from?.toLowerCase() === root;
        const match = filter === "all" || (filter === "out" && isOut) || (filter === "in" && !isOut);
        g.style.opacity = match ? "1" : "0.12";
        g.style.pointerEvents = match ? "auto" : "none";
      });

      cardElements.forEach((c) => {
        const type = c.getAttribute("data-type");
        const match = filter === "all" || filter === type;
        c.style.display = match ? "flex" : "none";
      });
    });
  });
};

function shortenAddress(addr) {
  if (!addr || addr.length < 12) return addr || "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
