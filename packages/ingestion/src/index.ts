import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createId } from "@codetruth/core";
import type {
  DetectedStackProfile,
  FileManifestEntry,
  SnapshotRecord,
} from "@codetruth/core";

const DEFAULT_IGNORE = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  ".data",
  "uploads",
  "__pycache__",
  ".venv",
  "venv",
]);

export interface IngestOptions {
  projectId: string;
  sourceRoot: string;
  destinationRoot: string;
  parentSnapshotId?: string;
}

export { diffSnapshots, diffSymbols } from "./diff.js";

async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

function detectLanguage(filePath: string): string | undefined {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".py": "python",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".md": "markdown",
    ".dockerfile": "docker",
  };
  if (ext === "" && path.basename(filePath).toLowerCase() === "dockerfile") {
    return "docker";
  }
  return map[ext];
}

async function walkFiles(root: string, relative = ""): Promise<string[]> {
  const current = path.join(root, relative);
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (DEFAULT_IGNORE.has(entry.name)) continue;
    const rel = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(root, rel)));
    } else if (entry.isFile()) {
      files.push(rel);
    }
  }

  return files;
}

function emptyStackProfile(): DetectedStackProfile {
  return {
    languages: [],
    frameworks: [],
    packageManagers: [],
    containerization: [],
    infrastructureAsCode: [],
    cicd: [],
    testFrameworks: [],
  };
}

async function detectStackProfile(
  root: string,
  manifest: FileManifestEntry[],
): Promise<DetectedStackProfile> {
  const profile = emptyStackProfile();
  const paths = new Set(manifest.map((entry) => entry.path.replace(/\\/g, "/")));

  const languages = new Set(
    manifest.map((entry) => entry.language).filter((value): value is string => Boolean(value)),
  );
  profile.languages = [...languages];

  if (paths.has("package.json")) profile.packageManagers.push("npm");
  if (paths.has("pnpm-lock.yaml")) profile.packageManagers.push("pnpm");
  if (paths.has("yarn.lock")) profile.packageManagers.push("yarn");
  if (paths.has("requirements.txt") || paths.has("pyproject.toml")) {
    profile.packageManagers.push("pip");
  }

  if (paths.has("package.json")) {
    try {
      const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.next) profile.frameworks.push("next.js");
      if (deps.react) profile.frameworks.push("react");
      if (deps.express) profile.frameworks.push("express");
      if (deps.fastify) profile.frameworks.push("fastify");
      if (deps.vitest || deps.jest) {
        profile.testFrameworks.push(deps.vitest ? "vitest" : "jest");
      }
    } catch {
      // ignore malformed package.json during detection
    }
  }

  if ([...paths].some((p) => p.toLowerCase().includes("dockerfile") || p.endsWith("docker-compose.yml"))) {
    profile.containerization.push("docker");
  }
  if ([...paths].some((p) => p.endsWith(".tf") || p.includes("terraform/"))) {
    profile.infrastructureAsCode.push("terraform");
  }
  if (paths.has(".github/workflows")) {
    profile.cicd.push("github_actions");
  }

  return profile;
}

export async function ingestDirectory(options: IngestOptions): Promise<SnapshotRecord> {
  const snapshotId = createId("snap");
  const snapshotDir = path.join(options.destinationRoot, snapshotId);
  await mkdir(snapshotDir, { recursive: true });

  const relativeFiles = await walkFiles(options.sourceRoot);
  const manifest: FileManifestEntry[] = [];

  for (const rel of relativeFiles) {
    const sourcePath = path.join(options.sourceRoot, rel);
    const targetPath = path.join(snapshotDir, rel);
    await mkdir(path.dirname(targetPath), { recursive: true });
    const content = await readFile(sourcePath);
    await writeFile(targetPath, content);
    const fileStat = await stat(sourcePath);
    manifest.push({
      path: rel.replace(/\\/g, "/"),
      hash: await hashFile(sourcePath),
      size: fileStat.size,
      language: detectLanguage(rel),
    });
  }

  manifest.sort((a, b) => a.path.localeCompare(b.path));
  const aggregate = createHash("sha256");
  for (const entry of manifest) {
    aggregate.update(entry.path);
    aggregate.update(entry.hash);
  }

  const stackProfile = await detectStackProfile(snapshotDir, manifest);

  return {
    id: snapshotId,
    projectId: options.projectId,
    hash: aggregate.digest("hex"),
    createdAt: new Date().toISOString(),
    fileCount: manifest.length,
    manifest,
    stackProfile,
    rootPath: snapshotDir,
    parentSnapshotId: options.parentSnapshotId,
  };
}