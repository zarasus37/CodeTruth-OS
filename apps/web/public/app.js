import { initSpatialNavigator } from "./spatial-navigator.js";

const state = {
  token: localStorage.getItem("codetruth_token") || "",
  user: null,
  workspaces: [],
  workspaceId: localStorage.getItem("codetruth_workspace") || "",
  projects: [],
  projectId: localStorage.getItem("codetruth_project") || "",
  analysisId: "",
  collaboration: { reviews: [], annotations: [], approval: null },
  report: null,
};

const loginPanel = document.getElementById("login-panel");
const appPanel = document.getElementById("app-panel");
const userChip = document.getElementById("user-chip");
const workspaceSelect = document.getElementById("workspace-select");
const projectSelect = document.getElementById("project-select");
const workspaceRole = document.getElementById("workspace-role");
const analysisStatus = document.getElementById("analysis-status");
const progressBar = document.getElementById("progress-bar");
const scorecardPanel = document.getElementById("scorecard-panel");
const findingsPanel = document.getElementById("findings-panel");
const reportPreview = document.getElementById("report-preview");
const analysisMeta = document.getElementById("analysis-meta");
const snapshotDiffPanel = document.getElementById("snapshot-diff-panel");
const spatialPanel = document.getElementById("spatial-panel");
const spatialCanvasWrap = document.getElementById("spatial-canvas-wrap");
const spatialLegend = document.getElementById("spatial-legend");
const spatialSelection = document.getElementById("spatial-selection");
const spatialDiffLegend = document.getElementById("spatial-diff-legend");
const portfolioPanel = document.getElementById("portfolio-panel");
const portfolioSummary = document.getElementById("portfolio-summary");
const portfolioMetrics = document.getElementById("portfolio-metrics");
const portfolioGrid = document.getElementById("portfolio-grid");
const portfolioTrends = document.getElementById("portfolio-trends");
const portfolioCanvasWrap = document.getElementById("portfolio-canvas-wrap");
const compliancePanel = document.getElementById("compliance-panel");
const complianceSummary = document.getElementById("compliance-summary");
const complianceFrameworks = document.getElementById("compliance-frameworks");
const complianceViolations = document.getElementById("compliance-violations");
const cognitionPanel = document.getElementById("cognition-panel");
const activityFeed = document.getElementById("activity-feed");
const compliancePolicies = document.getElementById("compliance-policies");
const spatialTimelineWrap = document.getElementById("spatial-timeline-wrap");
const spatialTimeline = document.getElementById("spatial-timeline");
const spatialTimelineLabel = document.getElementById("spatial-timeline-label");

let disposeSpatial = null;
let disposePortfolioSpatial = null;
let cognitionStream = null;
let projectTimeline = [];

const exportButtons = [
  "report-md-link",
  "report-json-link",
  "report-html-link",
  "export-findings-csv",
  "export-tasks-github",
  "export-tasks-jira",
  "export-tasks-linear",
  "report-submit-btn",
  "report-approve-btn",
];

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(path, { ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === "string" ? payload : payload.error || payload.message || "Request failed";
    throw new Error(message);
  }
  return payload;
}

function currentWorkspace() {
  return state.workspaces.find((ws) => ws.id === state.workspaceId);
}

function hasPermission(permission) {
  const ws = currentWorkspace();
  return ws?.permissions?.includes(permission) ?? false;
}

function setVisibleAuthenticated(visible) {
  loginPanel.classList.toggle("hidden", visible);
  appPanel.classList.toggle("hidden", !visible);
}

function fillSelect(select, items, selectedId, labelKey = "name") {
  select.innerHTML = "";
  for (const item of items) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item[labelKey];
    if (item.id === selectedId) option.selected = true;
    select.appendChild(option);
  }
}

function toggleExportButtons(visible) {
  for (const id of exportButtons) {
    document.getElementById(id).classList.toggle("hidden", !visible);
  }
}

function renderScorecard(report) {
  if (!report?.scorecard) {
    scorecardPanel.classList.add("hidden");
    return;
  }
  const { scorecard } = report;
  scorecardPanel.innerHTML = `
    <div class="scorecard-head">
      <strong>${scorecard.overall}/100</strong>
      <span class="muted">${scorecard.maturityStage.replace(/_/g, " ")}</span>
    </div>
    <div class="scorecard-grid">
      ${scorecard.domains
        .map(
          (d) => `
        <div class="scorecard-item">
          <span>${d.domain}</span>
          <strong>${d.score}</strong>
          <small class="muted">${d.confidence}</small>
        </div>`,
        )
        .join("")}
    </div>`;
  scorecardPanel.classList.remove("hidden");
}

function reviewForFinding(findingId) {
  return state.collaboration.reviews.find((r) => r.findingId === findingId);
}

function annotationsForFinding(findingId) {
  return state.collaboration.annotations.filter((a) => a.findingId === findingId);
}

function renderFindings(report) {
  if (!report?.findings?.length) {
    findingsPanel.classList.add("hidden");
    return;
  }

  findingsPanel.innerHTML = report.findings
    .map((finding) => {
      const review = reviewForFinding(finding.id);
      const annotations = annotationsForFinding(finding.id);
      const canReview = hasPermission("finding:annotate");
      return `
      <article class="finding-card" data-finding-id="${finding.id}">
        <div class="finding-head">
          <h3>${finding.title}</h3>
          <span class="finding-badge">${finding.severity}</span>
        </div>
        <p class="muted">${finding.domain} · ${finding.confidence}</p>
        <p>${finding.description}</p>
        ${review ? `<p class="review-status">Review: <strong>${review.status}</strong>${review.rationale ? ` — ${review.rationale}` : ""}</p>` : ""}
        ${
          annotations.length
            ? `<ul class="annotation-list">${annotations.map((a) => `<li>${a.body}</li>`).join("")}</ul>`
            : ""
        }
        ${
          canReview
            ? `<div class="finding-actions">
          <input type="text" class="annotation-input" placeholder="Add annotation..." data-finding-id="${finding.id}" />
          <button type="button" class="ghost annotate-btn" data-finding-id="${finding.id}">Annotate</button>
          <button type="button" class="ghost accept-btn" data-finding-id="${finding.id}">Accept</button>
          <button type="button" class="ghost reject-btn" data-finding-id="${finding.id}">Reject</button>
          <button type="button" class="ghost defer-btn" data-finding-id="${finding.id}">Defer</button>
        </div>`
            : ""
        }
      </article>`;
    })
    .join("");

  findingsPanel.classList.remove("hidden");

  findingsPanel.querySelectorAll(".annotate-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const findingId = btn.dataset.findingId;
      const input = findingsPanel.querySelector(`.annotation-input[data-finding-id="${findingId}"]`);
      const body = input?.value?.trim();
      if (!body) return;
      await api(`/analyses/${state.analysisId}/findings/${findingId}/annotations`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      await loadCollaboration();
      renderFindings(state.report);
    });
  });

  for (const [selector, status] of [
    [".accept-btn", "accepted"],
    [".reject-btn", "rejected"],
    [".defer-btn", "deferred"],
  ]) {
    findingsPanel.querySelectorAll(selector).forEach((btn) => {
      btn.addEventListener("click", async () => {
        const findingId = btn.dataset.findingId;
        let rationale;
        if (status !== "accepted") {
          rationale = prompt(`Rationale for ${status}:`);
          if (!rationale?.trim()) return;
        }
        await api(`/analyses/${state.analysisId}/findings/${findingId}/review`, {
          method: "POST",
          body: JSON.stringify({ status, rationale }),
        });
        await loadCollaboration();
        renderFindings(state.report);
      });
    });
  }
}

async function loadCollaboration() {
  if (!state.analysisId) return;
  state.collaboration = await api(`/analyses/${state.analysisId}/collaboration`);
  updateApprovalButtons();
}

function updateApprovalButtons() {
  const approval = state.collaboration.approval;
  const submitBtn = document.getElementById("report-submit-btn");
  const approveBtn = document.getElementById("report-approve-btn");
  submitBtn.classList.toggle("hidden", !state.analysisId || !hasPermission("analysis:trigger") || approval?.status === "pending_review" || approval?.status === "approved");
  approveBtn.classList.toggle("hidden", !state.analysisId || !hasPermission("report:approve") || approval?.status !== "pending_review");
}

function renderAnalysisMeta(analysis) {
  if (!analysis) {
    analysisMeta.classList.add("hidden");
    return;
  }

  const artifacts = analysis.artifacts ?? {};
  const parser = artifacts.parserStats;
  const chips = [];

  if (artifacts.llmPowered) {
    chips.push("<span class=\"meta-chip\"><strong>LLM</strong> Truth Council</span>");
  } else if (artifacts.llmFallbackReason) {
    chips.push(
      `<span class="meta-chip meta-warn" title="${artifacts.llmFallbackReason}"><strong>Heuristic</strong> council (LLM unavailable)</span>`,
    );
  } else {
    chips.push("<span class=\"meta-chip\">Heuristic Truth Council</span>");
  }

  if (parser?.treesitter) {
    chips.push(`<span class="meta-chip"><strong>Tree-sitter</strong> ${parser.treesitter} files</span>`);
  }

  if (parser) {
    const langs = [
      ["babel", "JS/TS"],
      ["python", "Py"],
      ["go", "Go"],
      ["rust", "Rust"],
      ["java", "Java"],
      ["csharp", "C#"],
      ["ruby", "Ruby"],
    ]
      .filter(([key]) => parser[key] > 0)
      .map(([key, label]) => `<strong>${parser[key]}</strong> ${label}`)
      .join(" · ");
    chips.push(
      `<span class="meta-chip">Parsed: ${langs || "none"} · ${parser.skipped ?? 0} skipped · ${parser.total ?? 0} total</span>`,
    );
  }

  if (analysis.incrementalBaseSnapshotId) {
    chips.push("<span class=\"meta-chip\"><strong>Incremental</strong> vs prior snapshot</span>");
  }

  analysisMeta.innerHTML = chips.join("");
  analysisMeta.classList.toggle("hidden", !chips.length);
}

function renderSnapshotDiff(diff) {
  if (!diff) {
    snapshotDiffPanel.classList.add("hidden");
    return;
  }

  const fileLines = [
    ...diff.added.slice(0, 8).map((f) => `+ ${f.path}`),
    ...diff.removed.slice(0, 8).map((f) => `- ${f.path}`),
    ...diff.modified.slice(0, 8).map((f) => `~ ${f.path}`),
  ];

  const overflow =
    diff.added.length + diff.removed.length + diff.modified.length > fileLines.length
      ? "<p class=\"muted\">…truncated</p>"
      : "";

  const langRows = (diff.languageBreakdown ?? [])
    .filter((l) => l.added + l.removed + l.modified > 0)
    .map(
      (l) =>
        `<tr><td>${l.language}</td><td>${l.added}</td><td>${l.removed}</td><td>${l.modified}</td></tr>`,
    )
    .join("");

  const symbolLines = (diff.symbolChanges ?? [])
    .slice(0, 6)
    .map((s) => `${s.change === "added" ? "+" : s.change === "removed" ? "-" : "~"} ${s.filePath} :: ${s.name}`)
    .join("<br>");

  snapshotDiffPanel.innerHTML = `
    <h3>Snapshot diff</h3>
    <div class="snapshot-diff-grid">
      <div><span>Added</span><strong>${diff.added.length}</strong></div>
      <div><span>Removed</span><strong>${diff.removed.length}</strong></div>
      <div><span>Modified</span><strong>${diff.modified.length}</strong></div>
      <div><span>Drift score</span><strong>${Math.round((diff.driftScore ?? diff.changeRatio) * 100)}%</strong></div>
    </div>
    ${langRows ? `<table class="diff-lang-table"><thead><tr><th>Language</th><th>+</th><th>-</th><th>~</th></tr></thead><tbody>${langRows}</tbody></table>` : ""}
    <div class="snapshot-diff-files">${fileLines.join("<br>") || "No file changes"}</div>
    ${symbolLines ? `<div class="snapshot-diff-symbols"><strong>Symbol drift</strong><br>${symbolLines}</div>` : ""}
    ${overflow}`;

  snapshotDiffPanel.classList.remove("hidden");
}

async function loadSnapshotDiff(analysis) {
  if (!analysis?.incrementalBaseSnapshotId || !analysis.snapshotId) {
    renderSnapshotDiff(null);
    return;
  }

  try {
    const payload = await api(
      `/snapshots/${analysis.snapshotId}/diff?base=${encodeURIComponent(analysis.incrementalBaseSnapshotId)}&symbols=true`,
    );
    renderSnapshotDiff(payload.diff);
  } catch {
    renderSnapshotDiff(null);
  }
}

function renderSpatialLegend(layers) {
  const kinds = layers?.length
    ? layers.map((l) => l.nodeKind)
    : ["domain", "service", "module", "file", "symbol", "finding"];
  spatialLegend.innerHTML = kinds
    .map((kind) => `<span class="legend-chip legend-${kind}">${kind}</span>`)
    .join("");
}

async function loadSpatialGraphForAnalysis(analysisId) {
  if (!analysisId) return;
  disposeSpatial?.();
  disposeSpatial = null;

  try {
    const payload = await api(`/analyses/${analysisId}/spatial`);
    renderSpatialLegend(payload.spatialGraph.layers);
    const hasDiff = payload.spatialGraph.nodes?.some((n) => n.diffState && n.diffState !== "unchanged");
    spatialDiffLegend.classList.toggle("hidden", !hasDiff);
    if (payload.spatialGraph.diffOverlay) {
      spatialSelection.textContent = `Drift ${Math.round((payload.spatialGraph.diffOverlay.driftScore ?? 0) * 100)}% vs prior snapshot`;
    }
    spatialPanel.classList.remove("hidden");
    disposeSpatial = initSpatialNavigator(spatialCanvasWrap, payload.spatialGraph, {
      onSelect(node) {
        const diff = node.diffState ? ` · ${node.diffState}` : "";
        spatialSelection.textContent = `${node.kind}: ${node.label}${diff}${node.filePath ? ` (${node.filePath})` : ""}${node.score != null ? ` · score ${node.score}` : ""}`;
      },
    });
  } catch {
    spatialPanel.classList.add("hidden");
  }
}

async function loadSpatialGraph() {
  await loadSpatialGraphForAnalysis(state.analysisId);
}

async function loadProjectTimeline() {
  projectTimeline = [];
  spatialTimelineWrap.classList.add("hidden");

  if (!state.workspaceId || !state.projectId) return;

  try {
    const payload = await api(
      `/workspaces/${state.workspaceId}/projects/${state.projectId}/timeline`,
    );
    projectTimeline = payload.points ?? [];
    if (projectTimeline.length < 2) return;

    spatialTimelineWrap.classList.remove("hidden");
    spatialTimeline.min = "0";
    spatialTimeline.max = String(projectTimeline.length - 1);
    const currentIndex = Math.max(
      0,
      projectTimeline.findIndex((p) => p.analysisId === state.analysisId),
    );
    spatialTimeline.value = String(currentIndex >= 0 ? currentIndex : projectTimeline.length - 1);
    updateTimelineLabel(Number(spatialTimeline.value));
  } catch {
    spatialTimelineWrap.classList.add("hidden");
  }
}

function updateTimelineLabel(index) {
  const point = projectTimeline[index];
  if (!point) {
    spatialTimelineLabel.textContent = "";
    return;
  }
  spatialTimelineLabel.textContent = `${new Date(point.completedAt).toLocaleString()} · score ${point.overallScore}/100 · ${point.findingCount} findings`;
}

function stopCognitionStream() {
  cognitionStream?.close();
  cognitionStream = null;
}

function prependActivityEvent(event) {
  const existing = activityFeed.querySelector(`[data-activity-id="${event.id}"]`);
  if (existing) return;

  const muted = activityFeed.querySelector(".muted");
  if (muted && !activityFeed.querySelector(".activity-item")) {
    activityFeed.innerHTML = "";
  }

  const article = document.createElement("article");
  article.className = "activity-item";
  article.dataset.activityId = event.id;
  article.innerHTML = `
    ${event.summary}
    <time>${new Date(event.timestamp).toLocaleString()} · ${event.type.replace(/_/g, " ")}</time>
  `;
  activityFeed.prepend(article);
}

function startCognitionStream() {
  stopCognitionStream();
  if (!state.workspaceId || !state.token) return;

  const url = `/workspaces/${state.workspaceId}/cognition/stream?access_token=${encodeURIComponent(state.token)}`;
  cognitionStream = new EventSource(url);

  cognitionStream.addEventListener("activity", (event) => {
    try {
      prependActivityEvent(JSON.parse(event.data));
    } catch {
      // ignore malformed events
    }
  });

  cognitionStream.onerror = () => {
    stopCognitionStream();
  };
}

async function loadCompliancePolicies() {
  if (!state.workspaceId) {
    compliancePolicies.innerHTML = "";
    return;
  }

  try {
    const payload = await api(`/workspaces/${state.workspaceId}/compliance/policies`);
    compliancePolicies.innerHTML = payload.policies.length
      ? payload.policies
          .map(
            (policy) => `
          <article class="policy-card" data-policy-id="${policy.id}">
            <strong>${policy.title}</strong>
            <p class="muted">${policy.description}</p>
            <small class="muted">${policy.domains.join(", ")} · threshold: ${policy.severityThreshold}</small>
            ${hasPermission("report:approve") ? `<button type="button" class="ghost policy-delete-btn" data-policy-id="${policy.id}">Delete</button>` : ""}
          </article>`,
          )
          .join("")
      : '<p class="muted">No custom policies. Add one to extend compliance beyond SOC2/ISO/NIST.</p>';

    compliancePolicies.querySelectorAll(".policy-delete-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this custom compliance policy?")) return;
        await api(`/workspaces/${state.workspaceId}/compliance/policies/${btn.dataset.policyId}`, {
          method: "DELETE",
        });
        await Promise.all([loadCompliance(), loadCompliancePolicies()]);
      });
    });
  } catch {
    compliancePolicies.innerHTML = '<p class="muted">Unable to load custom policies.</p>';
  }
}

async function loadReportView() {
  if (!state.analysisId) return;
  const analysisPayload = await api(`/analyses/${state.analysisId}`);
  renderAnalysisMeta(analysisPayload.analysis);
  await loadSnapshotDiff(analysisPayload.analysis);
  await loadProjectTimeline();
  await loadSpatialGraph();

  const payload = await api(`/analyses/${state.analysisId}/report?format=json`);
  state.report = payload.report;
  await loadCollaboration();
  renderScorecard(state.report);
  renderFindings(state.report);
  const markdown = await api(`/analyses/${state.analysisId}/report.md`);
  reportPreview.textContent = markdown.slice(0, 4000);
  toggleExportButtons(true);
  updateApprovalButtons();
}

async function bootstrapSession() {
  if (!state.token) {
    setVisibleAuthenticated(false);
    return;
  }

  const me = await api("/users/me");
  state.user = me.user;
  state.workspaces = me.workspaces;
  userChip.textContent = `${me.user.displayName} · ${me.user.email}`;
  userChip.classList.remove("hidden");
  setVisibleAuthenticated(true);

  if (!state.workspaces.length) {
    workspaceSelect.innerHTML = "<option>No workspaces yet</option>";
    workspaceRole.textContent = "Create a workspace to begin.";
    return;
  }

  if (!state.workspaceId || !state.workspaces.some((ws) => ws.id === state.workspaceId)) {
    state.workspaceId = state.workspaces[0].id;
  }

  fillSelect(workspaceSelect, state.workspaces, state.workspaceId);
  await loadWorkspaceContext();
}

async function loadWorkspaceContext() {
  const workspace = state.workspaces.find((ws) => ws.id === state.workspaceId);
  if (!workspace) return;

  localStorage.setItem("codetruth_workspace", state.workspaceId);
  workspaceRole.textContent = `Role: ${workspace.role} · Permissions: ${workspace.permissions.join(", ")}`;

  const payload = await api(`/workspaces/${state.workspaceId}/projects`);
  state.projects = payload.projects;
  if (!state.projects.length) {
    projectSelect.innerHTML = "<option>No projects yet</option>";
    state.projectId = "";
    portfolioPanel.classList.add("hidden");
    return;
  }

  if (!state.projectId || !state.projects.some((project) => project.id === state.projectId)) {
    state.projectId = state.projects[0].id;
  }

  fillSelect(projectSelect, state.projects, state.projectId);
  localStorage.setItem("codetruth_project", state.projectId);
  await Promise.all([loadPortfolio(), loadCompliance(), loadCognition()]);
}

function formatFrameworkLabel(id) {
  return id.replace(/_/g, " ").toUpperCase();
}

async function loadPortfolio() {
  if (!state.workspaceId) {
    portfolioPanel.classList.add("hidden");
    return;
  }

  try {
    const portfolio = await api(`/workspaces/${state.workspaceId}/portfolio`);
    portfolioPanel.classList.remove("hidden");
    portfolioSummary.textContent = `${portfolio.projectCount} projects · score ${portfolio.aggregateScore}/100 · compliance ${portfolio.complianceScore ?? portfolio.aggregateComplianceScore ?? 0}/100`;

    portfolioMetrics.innerHTML = `
      <div class="metric-card"><span class="muted">Compliance</span><strong>${portfolio.aggregateComplianceScore ?? 0}</strong></div>
      <div class="metric-card"><span class="muted">Open violations</span><strong>${portfolio.complianceSummary?.openViolations ?? 0}</strong></div>
      <div class="metric-card"><span class="muted">Drift alerts</span><strong>${portfolio.driftAlerts?.length ?? 0}</strong></div>
      <div class="metric-card"><span class="muted">Production ready</span><strong>${portfolio.maturityDistribution?.production_ready ?? 0}</strong></div>
    `;

    portfolioGrid.innerHTML = portfolio.projects
      .map(
        (p) => `
      <article class="portfolio-card${p.projectId === state.projectId ? " active" : ""}" data-project-id="${p.projectId}">
        <strong>${p.projectName}</strong>
        <div class="score">${p.overallScore ?? "—"}</div>
        <small class="muted">${p.maturityStage?.replace(/_/g, " ") ?? "No analysis"}</small>
        <small class="muted">${p.findingCount ?? 0} findings${p.driftScore != null ? ` · drift ${Math.round(p.driftScore * 100)}%` : ""}</small>
        <small class="compliance">Compliance ${p.complianceScore ?? "—"}${p.openViolations ? ` · ${p.openViolations} violations` : ""}</small>
      </article>`,
      )
      .join("");

    portfolioGrid.querySelectorAll(".portfolio-card").forEach((card) => {
      card.addEventListener("click", () => {
        state.projectId = card.dataset.projectId;
        fillSelect(projectSelect, state.projects, state.projectId);
        localStorage.setItem("codetruth_project", state.projectId);
        portfolioGrid.querySelectorAll(".portfolio-card").forEach((c) => c.classList.remove("active"));
        card.classList.add("active");
        loadCognitionSchedule();
      });
    });

    const cognition = await api(`/workspaces/${state.workspaceId}/cognition/portfolio`);
    if (cognition.trendSeries?.length) {
      portfolioTrends.classList.remove("hidden");
      portfolioTrends.innerHTML = `
        <strong>Score trends</strong>
        <ul>${cognition.trendSeries
          .slice(0, 8)
          .map(
            (point) =>
              `<li>${point.projectName}: ${point.overallScore}/100 · ${point.findingCount} findings · ${new Date(point.completedAt).toLocaleString()}</li>`,
          )
          .join("")}</ul>
      `;
    } else {
      portfolioTrends.classList.add("hidden");
    }
  } catch {
    portfolioPanel.classList.add("hidden");
  }
}

async function loadCompliance() {
  if (!state.workspaceId) {
    compliancePanel.classList.add("hidden");
    return;
  }

  try {
    const payload = await api(`/workspaces/${state.workspaceId}/compliance`);
    compliancePanel.classList.remove("hidden");
    const compliance = payload.compliance;
    complianceSummary.textContent = `Portfolio compliance ${compliance.aggregateComplianceScore}/100 · ${compliance.openViolations} open violations`;

    complianceFrameworks.innerHTML = Object.entries(compliance.frameworkBreakdown)
      .map(
        ([framework, stats]) => `
        <article class="framework-card">
          <strong>${formatFrameworkLabel(framework)}</strong>
          <div class="score">${stats.score}/100</div>
          <small class="muted">${stats.passing} passing · ${stats.failing} failing controls</small>
        </article>`,
      )
      .join("");

    const violations = compliance.projects.flatMap((project) =>
      project.scorecards.flatMap((card) =>
        card.violations.slice(0, 3).map(
          (v) => `
          <div class="violation-item">
            <strong>${project.projectName}</strong> · ${card.framework.toUpperCase()} · ${v.controlTitle}
            <br /><span class="muted">${v.findingTitle} (${v.severity})</span>
          </div>`,
        ),
      ),
    );

    complianceViolations.innerHTML = violations.length
      ? violations.slice(0, 12).join("")
      : '<p class="muted">No open compliance violations.</p>';

    await loadCompliancePolicies();
  } catch {
    compliancePanel.classList.add("hidden");
  }
}

async function loadCognitionSchedule() {
  if (!state.workspaceId || !state.projectId) return;
  try {
    const payload = await api(`/workspaces/${state.workspaceId}/cognition/schedules`);
    const schedule = payload.schedules.find((entry) => entry.projectId === state.projectId);
    document.getElementById("reanalysis-enabled").checked = Boolean(schedule?.enabled);
    if (schedule?.interval) {
      document.getElementById("reanalysis-interval").value = schedule.interval;
    }
  } catch {
    // ignore schedule load errors
  }
}

async function loadCognition() {
  if (!state.workspaceId) {
    cognitionPanel.classList.add("hidden");
    return;
  }

  try {
    cognitionPanel.classList.remove("hidden");
    await loadCognitionSchedule();

    const payload = await api(`/workspaces/${state.workspaceId}/cognition/activity`);
    activityFeed.innerHTML = payload.events.length
      ? payload.events
          .map(
            (event) => `
          <article class="activity-item" data-activity-id="${event.id}">
            ${event.summary}
            <time>${new Date(event.timestamp).toLocaleString()} · ${event.type.replace(/_/g, " ")}</time>
          </article>`,
          )
          .join("")
      : '<p class="muted">No cognition activity yet. Enable live re-analysis or run an analysis.</p>';

    startCognitionStream();
  } catch {
    cognitionPanel.classList.add("hidden");
    stopCognitionStream();
  }
}

function updateAnalysisUi(analysis) {
  analysisStatus.textContent = `${analysis.status} (${analysis.progress}%)`;
  progressBar.style.width = `${analysis.progress}%`;
}

function streamAnalysis(analysisId) {
  return new Promise((resolve, reject) => {
    const url = `/analyses/${analysisId}/stream?access_token=${encodeURIComponent(state.token)}`;
    const source = new EventSource(url);

    source.addEventListener("progress", (event) => {
      try {
        const payload = JSON.parse(event.data);
        analysisStatus.textContent = `${payload.stage} (${payload.progress}%)`;
        progressBar.style.width = `${payload.progress}%`;
        if (payload.partial?.consensusSummary) {
          reportPreview.textContent = payload.partial.consensusSummary;
        }
      } catch {
        // ignore malformed events
      }
    });

    source.addEventListener("done", async (event) => {
      source.close();
      try {
        const payload = JSON.parse(event.data);
        if (payload.status === "failed") {
          reject(new Error("Analysis failed"));
          return;
        }
        state.analysisId = analysisId;
        await loadReportView();
        resolve(undefined);
      } catch (error) {
        reject(error);
      }
    });

    source.onerror = () => {
      source.close();
      pollAnalysisFallback(analysisId).then(resolve).catch(reject);
    };
  });
}

async function pollAnalysisFallback(analysisId) {
  while (true) {
    const payload = await api(`/analyses/${analysisId}`);
    const analysis = payload.analysis;
    updateAnalysisUi(analysis);

    if (analysis.status === "completed") {
      state.analysisId = analysisId;
      await loadReportView();
      return;
    }

    if (analysis.status === "failed") {
      reportPreview.textContent = analysis.error || "Analysis failed.";
      throw new Error(analysis.error || "Analysis failed");
    }

    await new Promise((resolve) => setTimeout(resolve, 800));
  }
}

async function pollAnalysis(analysisId) {
  try {
    await streamAnalysis(analysisId);
  } catch {
    await pollAnalysisFallback(analysisId);
  }
}

async function downloadExport(path, filename) {
  const response = await fetch(path, { headers: { Authorization: `Bearer ${state.token}` } });
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

document.getElementById("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.getElementById("email").value.trim();
  const displayName = document.getElementById("display-name").value.trim();
  const session = await api("/auth/session", {
    method: "POST",
    body: JSON.stringify({ email, displayName }),
  });
  state.token = session.token;
  localStorage.setItem("codetruth_token", state.token);
  await bootstrapSession();
});

document.getElementById("create-workspace").addEventListener("click", async () => {
  const name = prompt("Workspace name", "My Workspace");
  if (!name) return;
  const payload = await api("/workspaces", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  state.workspaces.push({
    ...payload.workspace,
    role: payload.membership.role,
    permissions: payload.permissions,
  });
  state.workspaceId = payload.workspace.id;
  fillSelect(workspaceSelect, state.workspaces, state.workspaceId);
  await loadWorkspaceContext();
});

document.getElementById("create-project").addEventListener("click", async () => {
  if (!state.workspaceId) return;
  const name = prompt("Project name", "New Project");
  if (!name) return;
  const payload = await api(`/workspaces/${state.workspaceId}/projects`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  state.projects.push(payload.project);
  state.projectId = payload.project.id;
  fillSelect(projectSelect, state.projects, state.projectId);
  localStorage.setItem("codetruth_project", state.projectId);
});

workspaceSelect.addEventListener("change", async () => {
  state.workspaceId = workspaceSelect.value;
  await loadWorkspaceContext();
});

projectSelect.addEventListener("change", async () => {
  state.projectId = projectSelect.value;
  localStorage.setItem("codetruth_project", state.projectId);
  await loadCognitionSchedule();
  await loadProjectTimeline();
});

document.getElementById("invite-btn").addEventListener("click", async () => {
  const email = document.getElementById("invite-email").value.trim();
  const role = document.getElementById("invite-role").value;
  if (!email || !state.workspaceId) return;
  await api(`/workspaces/${state.workspaceId}/invite`, {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
  document.getElementById("invite-email").value = "";
  alert(`Invited ${email} as ${role}.`);
});

document.getElementById("reanalyze-btn").addEventListener("click", async () => {
  if (!state.workspaceId || !state.projectId) return;
  try {
    const payload = await api(
      `/workspaces/${state.workspaceId}/cognition/reanalyze/${state.projectId}`,
      { method: "POST", body: "{}" },
    );
    state.analysisId = payload.analysis.id;
    reportPreview.textContent = "Live re-analysis running...";
    await pollAnalysis(state.analysisId);
    await Promise.all([loadPortfolio(), loadCompliance(), loadCognition()]);
  } catch (error) {
    alert(error.message);
  }
});

document.getElementById("save-schedule-btn").addEventListener("click", async () => {
  if (!state.workspaceId || !state.projectId) return;
  const enabled = document.getElementById("reanalysis-enabled").checked;
  const interval = document.getElementById("reanalysis-interval").value;
  await api(`/workspaces/${state.workspaceId}/cognition/schedules/${state.projectId}`, {
    method: "PUT",
    body: JSON.stringify({ enabled, interval }),
  });
  await loadCognition();
  alert(`Live re-analysis ${enabled ? "enabled" : "disabled"} (${interval}).`);
});

document.getElementById("compliance-export-csv").addEventListener("click", async () => {
  if (!state.workspaceId) return;
  await downloadExport(
    `/workspaces/${state.workspaceId}/compliance/export?format=csv`,
    `compliance-${state.workspaceId}.csv`,
  );
});

document.getElementById("compliance-export-json").addEventListener("click", async () => {
  if (!state.workspaceId) return;
  const report = await api(`/workspaces/${state.workspaceId}/compliance/export?format=json`);
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `compliance-auditor-${state.workspaceId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
});

document.getElementById("compliance-add-policy").addEventListener("click", async () => {
  if (!state.workspaceId || !hasPermission("report:approve")) {
    return alert("You need report approval permissions to add policies.");
  }

  const title = prompt("Policy title", "Require authentication on all routes");
  if (!title) return;
  const description = prompt(
    "Policy description",
    "All HTTP routes must enforce authentication middleware.",
  );
  if (!description) return;

  await api(`/workspaces/${state.workspaceId}/compliance/policies`, {
    method: "POST",
    body: JSON.stringify({
      title,
      description,
      domains: ["security posture"],
      gapCategories: ["authentication system"],
      severityThreshold: "High-risk flaw",
    }),
  });
  await Promise.all([loadCompliance(), loadCompliancePolicies()]);
  alert("Custom compliance policy added.");
});

spatialTimeline?.addEventListener("input", async () => {
  const index = Number(spatialTimeline.value);
  updateTimelineLabel(index);
  const point = projectTimeline[index];
  if (point?.analysisId) {
    await loadSpatialGraphForAnalysis(point.analysisId);
  }
});

document.getElementById("compliance-attest-btn").addEventListener("click", async () => {
  if (!state.workspaceId) return;
  const notes = prompt("Attestation notes (optional)", "Reviewed and attested for institutional compliance.");
  await api(`/workspaces/${state.workspaceId}/compliance/attest`, {
    method: "POST",
    body: JSON.stringify({
      framework: "soc2",
      projectId: state.projectId || undefined,
      notes: notes || undefined,
    }),
  });
  await loadCompliance();
  alert("SOC2 attestation recorded.");
});

document.getElementById("portfolio-spatial-btn").addEventListener("click", async () => {
  if (!state.workspaceId) return;
  disposePortfolioSpatial?.();
  disposePortfolioSpatial = null;
  try {
    const payload = await api(`/workspaces/${state.workspaceId}/portfolio/spatial`);
    portfolioCanvasWrap.classList.remove("hidden");
    disposePortfolioSpatial = initSpatialNavigator(
      portfolioCanvasWrap,
      payload.portfolioGraph,
      {
        onSelect(node) {
          const projectId = node.meta?.projectId;
          spatialSelection.textContent = projectId
            ? `Portfolio · ${node.label} (project ${projectId})`
            : `Portfolio · ${node.kind}: ${node.label}`;
        },
      },
    );
  } catch (error) {
    alert(error.message);
  }
});

document.getElementById("gh-auth-mode").addEventListener("change", (event) => {
  const isApp = event.target.value === "app";
  document.getElementById("gh-installation-wrap").classList.toggle("hidden", !isApp);
});

document.getElementById("gh-connect-btn").addEventListener("click", async () => {
  if (!state.workspaceId || !state.projectId) return;
  const owner = document.getElementById("gh-owner").value.trim();
  const repo = document.getElementById("gh-repo").value.trim();
  const defaultBranch = document.getElementById("gh-branch").value.trim() || "main";
  const authMode = document.getElementById("gh-auth-mode").value;
  const installationRaw = document.getElementById("gh-installation-id").value.trim();
  if (!owner || !repo) return alert("Owner and repo are required.");
  if (authMode === "app" && !installationRaw) {
    return alert("Installation ID is required for GitHub App mode.");
  }

  const body = { owner, repo, defaultBranch, authMode };
  if (authMode === "app") body.installationId = Number(installationRaw);

  const payload = await api(
    `/workspaces/${state.workspaceId}/projects/${state.projectId}/github/connect`,
    { method: "POST", body: JSON.stringify(body) },
  );
  const info = document.getElementById("gh-webhook-info");
  info.textContent = JSON.stringify(
    {
      authMode: payload.authMode,
      githubAppEnabled: payload.githubAppEnabled,
      webhook: payload.webhook,
    },
    null,
    2,
  );
  info.classList.remove("hidden");
});

document.getElementById("upload-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.workspaceId || !state.projectId) {
    alert("Create a workspace and project first.");
    return;
  }

  const fileInput = document.getElementById("archive");
  const file = fileInput.files?.[0];
  if (!file) return;

  const uploadBtn = document.getElementById("upload-btn");
  uploadBtn.disabled = true;
  reportPreview.textContent = "Uploading and running analysis...";
  scorecardPanel.classList.add("hidden");
  findingsPanel.classList.add("hidden");
  analysisMeta.classList.add("hidden");
  snapshotDiffPanel.classList.add("hidden");
  spatialPanel.classList.add("hidden");
  disposeSpatial?.();
  disposeSpatial = null;
  toggleExportButtons(false);

  try {
    const formData = new FormData();
    formData.append("file", file);
    const payload = await api(
      `/workspaces/${state.workspaceId}/projects/${state.projectId}/upload`,
      { method: "POST", body: formData },
    );
    state.analysisId = payload.analysis.id;
    await pollAnalysis(state.analysisId);
  } catch (error) {
    reportPreview.textContent = error.message;
    analysisStatus.textContent = "Failed";
  } finally {
    uploadBtn.disabled = false;
  }
});

document.getElementById("report-submit-btn").addEventListener("click", async () => {
  await api(`/analyses/${state.analysisId}/report/submit`, { method: "POST", body: "{}" });
  await loadCollaboration();
  alert("Report submitted for approval.");
});

document.getElementById("report-approve-btn").addEventListener("click", async () => {
  const result = await api(`/analyses/${state.analysisId}/report/approve`, {
    method: "POST",
    body: JSON.stringify({ action: "approve" }),
  });
  await loadCollaboration();
  alert(`Report approved. Signature valid: ${result.signatureValid}`);
});

async function downloadReport(analysisId, format) {
  const path = format === "json" ? `/analyses/${analysisId}/report.json` : `/analyses/${analysisId}/report.md`;
  const content = await api(path);
  const blob = new Blob(
    [typeof content === "string" ? content : JSON.stringify(content, null, 2)],
    { type: format === "json" ? "application/json" : "text/markdown" },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `codetruth-report.${format === "json" ? "json" : "md"}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

document.getElementById("report-md-link").addEventListener("click", async (e) => {
  e.preventDefault();
  if (state.analysisId) await downloadReport(state.analysisId, "md");
});

document.getElementById("report-json-link").addEventListener("click", async (e) => {
  e.preventDefault();
  if (state.analysisId) await downloadReport(state.analysisId, "json");
});

document.getElementById("report-html-link").addEventListener("click", async (e) => {
  e.preventDefault();
  if (!state.analysisId) return;
  const html = await api(`/analyses/${state.analysisId}/report.html`);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
});

document.getElementById("export-findings-csv").addEventListener("click", async (e) => {
  e.preventDefault();
  if (state.analysisId) await downloadExport(`/analyses/${state.analysisId}/export/findings.csv`, "findings.csv");
});

document.getElementById("export-tasks-github").addEventListener("click", async (e) => {
  e.preventDefault();
  if (state.analysisId) await downloadExport(`/analyses/${state.analysisId}/export/tasks?format=github`, "tasks-github.json");
});

document.getElementById("export-tasks-jira").addEventListener("click", async (e) => {
  e.preventDefault();
  if (state.analysisId) await downloadExport(`/analyses/${state.analysisId}/export/tasks?format=jira`, "tasks-jira.csv");
});

document.getElementById("export-tasks-linear").addEventListener("click", async (e) => {
  e.preventDefault();
  if (state.analysisId) await downloadExport(`/analyses/${state.analysisId}/export/tasks?format=linear`, "tasks-linear.json");
});

bootstrapSession().catch(() => {
  localStorage.removeItem("codetruth_token");
  state.token = "";
  setVisibleAuthenticated(false);
});