import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const apiBase = process.env.CODETRUTH_API ?? "http://localhost:4310";

async function api(pathname, { token, method = "GET", body, formData } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";

  const response = await fetch(`${apiBase}${pathname}`, {
    method,
    headers,
    body: formData ?? (body ? JSON.stringify(body) : undefined),
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(typeof payload === "string" ? payload : payload.error || "Request failed");
  }
  return payload;
}

async function waitForHealth(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${apiBase}/health`);
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("API did not become healthy in time. Run `npm run dev` first.");
}

async function waitForAnalysis(token, analysisId) {
  while (true) {
    const payload = await api(`/analyses/${analysisId}`, { token });
    const analysis = payload.analysis;
    process.stdout.write(`\rPipeline: ${analysis.status} (${analysis.progress}%)   `);
    if (analysis.status === "completed" || analysis.status === "failed") {
      process.stdout.write("\n");
      return analysis;
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
}

async function main() {
  await waitForHealth();

  const session = await api("/auth/session", {
    method: "POST",
    body: { email: "demo@codetruth.local", displayName: "Demo User" },
  });
  const token = session.token;

  const workspacePayload = await api("/workspaces", {
    token,
    method: "POST",
    body: { name: "Demo Workspace" },
  });
  const workspaceId = workspacePayload.workspace.id;

  const projectPayload = await api(`/workspaces/${workspaceId}/projects`, {
    token,
    method: "POST",
    body: { name: "Demo Project" },
  });
  const projectId = projectPayload.project.id;

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "codetruth-demo-src-"));
  const demoDir = path.join(tempDir, "demo-app");
  await mkdir(path.join(demoDir, "src"), { recursive: true });
  await writeFile(
    path.join(demoDir, "package.json"),
    JSON.stringify({ name: "demo-app", private: true, scripts: { start: "node src/index.js" } }, null, 2),
  );
  await writeFile(
    path.join(demoDir, "src", "index.js"),
    "export function main() { console.log('hello'); }\n",
  );
  await writeFile(path.join(demoDir, "README.md"), "# Demo App\n");

  const zipPath = path.join(tempDir, "demo.zip");
  const zip = new AdmZip();
  zip.addLocalFolder(demoDir, "demo-app");
  zip.writeZip(zipPath);
  const zipBuffer = await readFile(zipPath);

  const form = new FormData();
  form.append("file", new Blob([zipBuffer]), "demo.zip");

  const uploadPayload = await api(
    `/workspaces/${workspaceId}/projects/${projectId}/upload`,
    { token, method: "POST", formData: form },
  );
  const analysis = await waitForAnalysis(token, uploadPayload.analysis.id);

  if (analysis.status !== "completed") {
    throw new Error(analysis.error ?? "Analysis failed");
  }

  const markdown = await api(`/analyses/${analysis.id}/report.md`, { token });
  const outputPath = path.join(repoRoot, ".data", "demo-report.md");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, "utf8");

  console.log("Demo complete.");
  console.log(`Workspace: ${workspaceId}`);
  console.log(`Project: ${projectId}`);
  console.log(`Analysis: ${analysis.id}`);
  console.log(`Report: ${outputPath}`);
  console.log(`Web UI: ${apiBase}/`);
  await rm(tempDir, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});