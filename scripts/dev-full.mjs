#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";

function run(command, args, label) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: isWin,
    env: process.env,
  });
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[${label}] exited with code ${code}`);
    }
  });
  return child;
}

async function loadDotEnv() {
  try {
    const raw = await readFile(path.join(repoRoot, ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx);
      const value = trimmed.slice(idx + 1);
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    console.warn("No .env found — run `npm run setup:env` first.");
  }
}

async function waitForRedis(url, timeoutMs = 20000) {
  const { default: Redis } = await import("ioredis");
  const client = new Redis(url, { maxRetriesPerRequest: 1, connectTimeout: 2000 });
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await client.ping();
      await client.quit();
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  await client.quit().catch(() => undefined);
  return false;
}

async function main() {
  await loadDotEnv();

  if (!process.env.REDIS_URL) {
    console.error("REDIS_URL is not set. Run `npm run setup:env` first.");
    process.exit(1);
  }

  console.log("Starting Redis (Docker)...");
  const infra = run("docker", ["compose", "up", "-d", "redis"], "infra");
  await new Promise((resolve, reject) => {
    infra.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`docker compose exited ${code}`))));
  }).catch((error) => {
    console.error(error.message);
    console.error("Start Docker Desktop, then re-run: npm run dev:full");
    process.exit(1);
  });

  const redisReady = await waitForRedis(process.env.REDIS_URL);
  if (!redisReady) {
    console.error("Redis did not become ready at", process.env.REDIS_URL);
    console.error("Start Docker Desktop, then: npm run redis:up");
    process.exit(1);
  }
  console.log("Redis is ready.");

  console.log("Building packages...");
  const build = run("npm", ["run", "build"], "build");
  await new Promise((resolve) => build.on("exit", resolve));

  const children = [
    run("npm", ["run", "dev", "-w", "@codetruth/worker"], "worker"),
    run("npm", ["run", "dev", "-w", "@codetruth/api"], "api"),
  ];

  const shutdown = () => {
    for (const child of children) child.kill("SIGTERM");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log("");
  console.log("CodeTruth OS running:");
  console.log("  API:    http://localhost:4310/");
  console.log("  Worker: processing analyses via Redis queue");
  console.log("  SSE:    live stream events via Redis pub/sub");
  console.log("");
  console.log("Press Ctrl+C to stop.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});