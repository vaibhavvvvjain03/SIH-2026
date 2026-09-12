/** Main controller. Data contracts and downstream renderers remain unchanged. */
const { fetchAttribution, fetchTransactions } = window.DataContract;
const { renderTransactionGraph } = window.Graph;
const { renderTimeline } = window.Timeline;
const { buildReportText, downloadReport } = window.Report;
const { renderForensicCharts, toggleFlowMode, destroyCharts } = window.ForensicCharts || {};

const form=document.getElementById("lookup-form"), addressInput=document.getElementById("address-input"), chainSelect=document.getElementById("chain-select"), analyzeBtn=document.getElementById("analyze-btn");
const pipelineEl=document.getElementById("pipeline"), resultsEl=document.getElementById("results"), candidatesList=document.getElementById("candidates-list"), candidateCount=document.getElementById("candidate-count"), graphContainer=document.getElementById("graph-container"), timelineContainer=document.getElementById("timeline-container"), statusMessage=document.getElementById("status-message"), exportBtn=document.getElementById("export-btn");
const metricFused=document.getElementById("metric-fused"), metricMl=document.getElementById("metric-ml"), metricGraph=document.getElementById("metric-graph"), metricTx=document.getElementById("metric-tx");
const PIPELINE_STEPS=["collection","features","scoring","fusion"];
let currentPrediction=null,currentTransactions=[];

// Flow view mode toggle
const btnFlowVol = document.getElementById("btn-flow-vol");
const btnFlowCount = document.getElementById("btn-flow-count");
if (btnFlowVol && btnFlowCount) {
  btnFlowVol.addEventListener("click", () => {
    btnFlowVol.classList.add("active");
    btnFlowCount.classList.remove("active");
    if (toggleFlowMode) toggleFlowMode("volume");
  });
  btnFlowCount.addEventListener("click", () => {
    btnFlowCount.classList.add("active");
    btnFlowVol.classList.remove("active");
    if (toggleFlowMode) toggleFlowMode("count");
  });
}

form.addEventListener("submit",async e=>{e.preventDefault();const address=addressInput.value.trim(),chain=chainSelect.value;if(!address){setStatus("Enter a wallet address to begin the trace.");return}setStatus("");analyzeBtn.disabled=true;analyzeBtn.querySelector("span:last-of-type").textContent="TRACE IN PROGRESS…";resultsEl.hidden=true;pipelineEl.hidden=false;resetPipeline();
 try{advanceStep("collection");const txnsPromise=fetchTransactions(address,chain);await tinyPause();advanceStep("features");const predictionPromise=fetchAttribution(address,chain);await tinyPause();advanceStep("scoring");const [transactions,prediction]=await Promise.all([txnsPromise,predictionPromise]);await tinyPause();advanceStep("fusion");await tinyPause();markStepDone("fusion");currentPrediction=prediction;currentTransactions=transactions;renderResults(prediction,transactions,address)}catch(err){console.error(err);setStatus("The trace collapsed. "+(err?.message||"Check the backend connection and try again."))}finally{analyzeBtn.disabled=false;analyzeBtn.querySelector("span:last-of-type").textContent="AWAKEN TRACE"}});

exportBtn.addEventListener("click",()=>{if(!currentPrediction)return;const text=buildReportText({prediction:currentPrediction,transactions:currentTransactions,generatedAt:new Date()});downloadReport(text,`investigation-report-${currentPrediction.address.slice(0,10)}.txt`)});

function renderResults(prediction,transactions,address){
  resultsEl.hidden=false;
  metricFused.textContent=formatScore(prediction.fused_score);
  metricMl.textContent=formatScore(prediction.ml_score);
  metricGraph.textContent=formatScore(prediction.graph_score);
  metricTx.textContent=formatScore(prediction.transaction_score);
  
  const chainDepthEl = document.getElementById("chain-depth");
  if (chainDepthEl) {
    chainDepthEl.textContent = prediction.transactions_analysed
      ? `${prediction.transactions_analysed} ON-CHAIN TRANSACTIONS ANALYSED`
      : "";
  }
  
  const disagreeEl = document.getElementById("disagreement-banner");
  if (disagreeEl) {
    if (prediction.ml_graph_agreement === false) {
      const graphPick = prediction.graph_nearest_vasp || "a different VASP";
      disagreeEl.innerHTML =
        `<strong>SIGNALS DIVERGE</strong> — the behavioural model and the ` +
        `transaction graph favour different candidates ` +
        `(graph points to ${escapeHtml(graphPick)}). ` +
        `Candidates below are ranked on combined evidence. Treat with caution.`;
      disagreeEl.hidden = false;
    } else {
      disagreeEl.hidden = true;
    }
  }
  
  if(prediction.unknown_or_insufficient_evidence){
    candidateCount.textContent="NO ASSERTION";
    candidatesList.innerHTML=`<div class="unknown-state"><strong>INSUFFICIENT EVIDENCE FOR VASP ATTRIBUTION</strong><p>The wallet did not match known VASP infrastructure with sufficient confidence. The console refuses to force a candidate.</p></div>`;
  } else {
    candidateCount.textContent=`${prediction.ranked_vasps.length} CANDIDATE${prediction.ranked_vasps.length===1?"":"S"}`;
    candidatesList.innerHTML="";
    const maxScore=Math.max(...prediction.ranked_vasps.map(v=>v.score),.0001);
    prediction.ranked_vasps.forEach((vasp,index)=>{
      const card=document.createElement("div");
      card.className = "candidate" + (vasp.graph_support ? " graph-backed" : "");
      card.innerHTML=`<div class="candidate-top"><span class="candidate-name"><span class="candidate-rank">0${index+1}</span>${escapeHtml(vasp.name)}</span><div class="candidate-meta">${vasp.graph_support ? '<span class="graph-flag" title="Supported by transaction graph evidence">◈ GRAPH</span>' : ''}<span class="candidate-score">${vasp.score.toFixed(3)}</span><span class="candidate-arrow" aria-hidden="true">▾</span></div></div><div class="candidate-bar-track"><div class="candidate-bar-fill" style="width:${(vasp.score/maxScore)*100}%"></div></div><div class="candidate-why"><div class="candidate-why-inner"><div class="candidate-score-breakdown"><span>ML · ${formatScore(prediction.ml_score)}</span><span>GRAPH · ${formatScore(prediction.graph_score)}</span><span>TX · ${formatScore(prediction.transaction_score)}</span></div><ul>${prediction.evidence.map(e=>`<li>${escapeHtml(e)}</li>`).join("")}</ul></div></div>`;
      card.addEventListener("click",()=>card.classList.toggle("expanded"));
      candidatesList.appendChild(card);
    });
  }
  
  // Populate Behavioural Feature Signature & Evidence Trail (fills empty left space)
  const featGrid = document.getElementById("feature-metrics-grid");
  const evList = document.getElementById("evidence-points-list");

  if (featGrid) {
    // Use model_features when available — these are computed over all fetched
    // transactions (up to 1000), matching exactly what the classifier saw.
    // Fall back to recomputing from the display transactions only if the backend
    // didn't return model_features (e.g. mock mode or old backend).
    const mf = prediction.model_features || null;

    let volEth, avgVal, stdVal, uniqueDays, cadence;

    if (mf) {
      // Issue 1 fix: use the model's own values, not a recomputation from 20 tx
      volEth    = Number(mf.volume_eth)  || 0;
      avgVal    = Number(mf.avg_tx_value) || 0;
      stdVal    = Number(mf.std_tx_value) || 0;
      uniqueDays = Math.round(Number(mf.active_days) || 0);
      cadence   = (Number(mf.transactions_per_day) || 0).toFixed(1);
    } else {
      const vals = (transactions || []).map((t) => Number(t.value) || 0);
      volEth = vals.reduce((a, b) => a + b, 0);
      avgVal = vals.length ? volEth / vals.length : 0;
      const variance = vals.length > 1
        ? vals.reduce((acc, v) => acc + Math.pow(v - avgVal, 2), 0) / (vals.length - 1)
        : 0;
      stdVal = Math.sqrt(variance);

      const dates = (transactions || [])
        .map((t) => (t.timestamp ? new Date(t.timestamp).toISOString().slice(0, 10) : null))
        .filter(Boolean);
      uniqueDays = new Set(dates).size || 1;
      const txCount = prediction.transactions_analysed || transactions.length || 0;
      cadence = (txCount / uniqueDays).toFixed(1);
    }

    // Issue 5 fix: don't report CONVERGENT when there is no signal
    const hasSignal = !prediction.unknown_or_insufficient_evidence;
    let signalLabel, signalClass;
    if (!hasSignal) {
      signalLabel = "— NO SIGNAL";
      signalClass = "feat-nosignal";
    } else if (prediction.ml_graph_agreement === false) {
      signalLabel = "DIVERGENT";
      signalClass = "feat-diverge";
    } else if (prediction.ml_graph_agreement === true) {
      signalLabel = "CONVERGENT";
      signalClass = "feat-match";
    } else {
      // 0-hop registry hit or missing partial data where no alignment is possible
      signalLabel = "—";
      signalClass = "feat-nosignal";
    }

    if (mf) {
      featGrid.style.display = "";
      const featHead = document.querySelector(".evidence-matrix-head");
      if (featHead) featHead.style.display = "";

      featGrid.innerHTML = `
        <div class="feat-chip">
          <span class="feat-name">Volume ETH</span>
          <strong class="feat-val">${volEth.toFixed(2)} Ξ</strong>
        </div>
        <div class="feat-chip">
          <span class="feat-name">Avg Transfer</span>
          <strong class="feat-val">${avgVal.toFixed(3)} Ξ</strong>
        </div>
        <div class="feat-chip">
          <span class="feat-name">Transfer StdDev</span>
          <strong class="feat-val">${stdVal.toFixed(3)}</strong>
        </div>
        <div class="feat-chip">
          <span class="feat-name">Active Days</span>
          <strong class="feat-val">${uniqueDays} days</strong>
        </div>
        <div class="feat-chip">
          <span class="feat-name">Tx Cadence</span>
          <strong class="feat-val">${cadence} tx/day</strong>
        </div>
        <div class="feat-chip">
          <span class="feat-name">Signal Agreement</span>
          <strong class="feat-val ${signalClass}">${signalLabel}</strong>
        </div>
      `;
    } else {
      featGrid.style.display = "none";
      const featHead = document.querySelector(".evidence-matrix-head");
      if (featHead) featHead.style.display = "none";
    }
  }

  if (evList && prediction.evidence) {
    evList.innerHTML = prediction.evidence
      .map((e, idx) => `<li><span class="ev-bullet">0${idx + 1}</span><span>${escapeHtml(e)}</span></li>`)
      .join("");
  }
  
  const vaspNames=prediction.ranked_vasps?prediction.ranked_vasps.map(v=>v.name):[];
  renderTransactionGraph(graphContainer,{rootAddress:address,transactions,vaspNames,transactionsAnalysed:prediction.transactions_analysed});
  if (window.Graph.initToolbar) window.Graph.initToolbar();
  renderTimeline(timelineContainer,{rootAddress:address,transactions,transactionsAnalysed:prediction.transactions_analysed});

  // Render forensic charts (Bar Chart, Pie Chart & Radar)
  if (renderForensicCharts) {
    renderForensicCharts({ prediction, transactions, rootAddress: address });
  }
}

function formatScore(value){return Number.isFinite(Number(value))?Number(value).toFixed(2):"—"}
function resetPipeline(){pipelineEl.querySelectorAll("li").forEach(li=>li.classList.remove("active","done"))}
function advanceStep(stepName){const idx=PIPELINE_STEPS.indexOf(stepName);PIPELINE_STEPS.forEach((name,i)=>{const li=pipelineEl.querySelector(`[data-step="${name}"]`);if(!li)return;li.classList.remove("active","done");if(i<idx)li.classList.add("done");if(i===idx)li.classList.add("active")})}
function markStepDone(stepName){const li=pipelineEl.querySelector(`[data-step="${stepName}"]`);if(li){li.classList.remove("active");li.classList.add("done")}}
function tinyPause(){return new Promise(r=>setTimeout(r,260))}
function setStatus(msg){statusMessage.textContent=msg}
function escapeHtml(str){const div=document.createElement("div");div.textContent=str;return div.innerHTML}

