import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const apiBase = process.env.CODETRUTH_API ?? "http://localhost:4310";

async function api(pathname, { token, method = "GET", body, formData, timeoutMs = 300000 } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${apiBase}${pathname}`, {
      method,
      headers,
      body: formData ?? (body ? JSON.stringify(body) : undefined),
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      throw new Error(typeof payload === "string" ? payload : payload.error || "Request failed");
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForAnalysis(token, analysisId) {
  while (true) {
    const payload = await api(`/analyses/${analysisId}`, { token, timeoutMs: 30000 });
    const analysis = payload.analysis;
    process.stdout.write(`\rPipeline: ${analysis.status} (${analysis.progress}%)   `);
    if (analysis.status === "completed" || analysis.status === "failed") {
      process.stdout.write("\n");
      return analysis;
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  section("Health");
  const health = await api("/health", { timeoutMs: 15000 });
  console.log(`API v${health.version} · storage=${health.storage} · analysis=${health.analysis}`);
  console.log(`V3 features: ${health.features.filter((f) => f.includes("cognition") || f.includes("compliance") || f.includes("reanalysis") || f.includes("portfolio-trends")).join(", ")}`);

  section("Auth + workspace");
  const session = await api("/auth/session", {
    method: "POST",
    body: { email: "v3-demo@codetruth.local", displayName: "V3 Demo" },
  });
  const token = session.token;

  const workspacePayload = await api("/workspaces", {
    token,
    method: "POST",
    body: { name: "V3 Cognition Demo" },
  });
  const workspaceId = workspacePayload.workspace.id;

  const projectPayload = await api(`/workspaces/${workspaceId}/projects`, {
    token,
    method: "POST",
    body: { name: "Payments API" },
  });
  const projectId = projectPayload.project.id;
  console.log(`Workspace ${workspaceId}`);
  console.log(`Project ${projectId}`);

  section("Upload + analyze");
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "codetruth-v3-demo-"));
  const demoDir = path.join(tempDir, "payments-api");
  await mkdir(path.join(demoDir, "src"), { recursive: true });
  await writeFile(
    path.join(demoDir, "package.json"),
    JSON.stringify(
      {
        name: "payments-api",
        private: true,
        scripts: { start: "node src/index.js", test: "node --test" },
        dependencies: { express: "^4.19.0" },
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(demoDir, "src", "index.js"),
    [
      "import express from 'express';",
      "const app = express();",
      "app.get('/health', (_, res) => res.json({ ok: true }));",
      "app.listen(3000);",
    ].join("\n"),
  );
  await writeFile(path.join(demoDir, "README.md"), "# Payments API\nNo auth middleware configured.\n");

  const zip = new AdmZip();
  zip.addLocalFolder(demoDir, "payments-api");
  const zipPath = path.join(tempDir, "demo.zip");
  zip.writeZip(zipPath);
  const zipBuffer = await readFile(zipPath);

  const form = new FormData();
  form.append("file", new Blob([zipBuffer]), "payments-api.zip");

  const uploadPayload = await api(
    `/workspaces/${workspaceId}/projects/${projectId}/upload`,
    { token, method: "POST", formData: form, timeoutMs: 300000 },
  );
  const analysis = await waitForAnalysis(token, uploadPayload.analysis.id);
  if (analysis.status !== "completed") {
    throw new Error(analysis.error ?? "Analysis failed");
  }
  console.log(`Analysis ${analysis.id} completed · score ${analysis.artifacts?.scorecard?.overall}`);

  section("Institutional portfolio");
  const portfolio = await api(`/workspaces/${workspaceId}/portfolio`, { token });
  console.log(
    `Projects=${portfolio.projectCount} · score=${portfolio.aggregateScore} · compliance=${portfolio.aggregateComplianceScore} · violations=${portfolio.complianceSummary?.openViolations}`,
  );

  section("Institutional compliance");
  const compliance = await api(`/workspaces/${workspaceId}/compliance`, { token });
  console.log(
    `Compliance score ${compliance.compliance.aggregateComplianceScore}/100 · open violations ${compliance.compliance.openViolations}`,
  );
  for (const [framework, stats] of Object.entries(compliance.compliance.frameworkBreakdown)) {
    console.log(`  ${framework}: ${stats.score}/100 (${stats.passing} passing, ${stats.failing} failing)`);
  }

  section("Cognition OS — schedule + re-analyze");
  const schedule = await api(`/workspaces/${workspaceId}/cognition/schedules/${projectId}`, {
    token,
    method: "PUT",
    body: { enabled: true, interval: "24h" },
  });
  console.log(`Schedule enabled · next run ${schedule.schedule.nextRunAt}`);

  const reanalysis = await api(`/workspaces/${workspaceId}/cognition/reanalyze/${projectId}`, {
    token,
    method: "POST",
    body: {},
  });
  const rerun = await waitForAnalysis(token, reanalysis.analysis.id);
  console.log(`Re-analysis ${rerun.id} · ${rerun.status} · triggeredBy=${rerun.triggeredBy}`);

  section("Cognition activity feed");
  const activity = await api(`/workspaces/${workspaceId}/cognition/activity`, { token });
  for (const event of activity.events.slice(0, 5)) {
    console.log(`  [${event.type}] ${event.summary}`);
  }

  section("Full institutional view");
  const institutional = await api(`/workspaces/${workspaceId}/cognition/portfolio`, { token });
  console.log(
    `Trend points=${institutional.trendSeries.length} · schedules=${institutional.schedules.length} · drift alerts=${institutional.driftAlerts.length}`,
  );

  const markdown = await api(`/analyses/${analysis.id}/report.md`, { token, timeoutMs: 60000 });
  const outputPath = path.join(repoRoot, ".data", "v3-demo-report.md");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, "utf8");

  section("Demo complete");
  console.log(`Web UI: ${apiBase}/`);
  console.log(`Report: ${outputPath}`);
  console.log(`Token (for UI): ${token.slice(0, 12)}...`);

  await rm(tempDir, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});