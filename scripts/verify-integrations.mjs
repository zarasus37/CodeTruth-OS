#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiBase = process.env.CODETRUTH_API ?? "http://localhost:4310";

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
    // ignore
  }
}

async function checkRedis() {
  if (!process.env.REDIS_URL) return { ok: false, detail: "REDIS_URL missing" };
  try {
    const { default: Redis } = await import("ioredis");
    const client = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 0,
      connectTimeout: 3000,
      lazyConnect: true,
      retryStrategy: () => null,
    });
    client.on("error", () => undefined);
    await client.connect();
    const pong = await client.ping();
    await client.quit();
    return { ok: pong === "PONG", detail: process.env.REDIS_URL };
  } catch (error) {
    return {
      ok: false,
      detail: `${error.message} — start Docker Desktop, then: npm run redis:up`,
    };
  }
}

async function checkPublicApiUrl() {
  const url = process.env.PUBLIC_API_URL;
  if (!url) {
    return { ok: false, detail: "PUBLIC_API_URL missing — required for GitHub webhooks in production" };
  }
  if (url.includes("localhost")) {
    return { ok: true, detail: `${url} (local dev — use ngrok/tunnel URL for GitHub webhooks)` };
  }
  return { ok: true, detail: url };
}

async function checkGitHubApp() {
  const appId = process.env.GITHUB_APP_ID;
  const keyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH;
  const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET;
  const slug = process.env.GITHUB_APP_SLUG;
  if (!appId || !keyPath || !webhookSecret) {
    return { ok: false, detail: "GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY_PATH, or GITHUB_APP_WEBHOOK_SECRET missing" };
  }
  try {
    const pem = await readFile(path.join(repoRoot, keyPath.replace(/^\.\//, "")), "utf8");
    const { createSign } = await import("node:crypto");
    const signer = createSign("RSA-SHA256");
    signer.update("codetruth-verify");
    signer.end();
    signer.sign(pem, "base64url");
    const placeholder = appId === "000000" || appId === "0";
    return {
      ok: !placeholder,
      detail: `appId=${appId}, slug=${slug ?? "missing"}, webhookSecret=set, pem=ok${placeholder ? " (replace placeholder App ID)" : ""}`,
    };
  } catch (error) {
    return { ok: false, detail: error.message };
  }
}

async function checkLlm() {
  const apiKey = process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, detail: "LLM_API_KEY not set — council will use heuristic mode" };

  const baseUrl = (process.env.LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.LLM_MODEL ?? "gpt-4o-mini";
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (response.ok) {
      return { ok: true, detail: `${baseUrl} models OK (${model})` };
    }
    const probe = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
      }),
    });
    if (probe.ok) {
      return { ok: true, detail: `${baseUrl} chat/completions OK (${model})` };
    }
    const text = await probe.text();
    if (probe.status === 429 && text.includes("quota")) {
      return {
        ok: true,
        detail: `${baseUrl} authenticated (${model}) — monthly quota exhausted, council will fall back until quota resets`,
      };
    }
    return {
      ok: false,
      detail: `LLM probe failed (${probe.status}) at ${baseUrl}: ${text.slice(0, 160)}`,
    };
  } catch (error) {
    return { ok: false, detail: error.message };
  }
}

async function checkApiHealth() {
  try {
    const response = await fetch(`${apiBase}/health`);
    if (!response.ok) return { ok: false, detail: `HTTP ${response.status}` };
    const payload = await response.json();
    return { ok: true, detail: payload };
  } catch (error) {
    return { ok: false, detail: `${error.message} — run npm run dev:full` };
  }
}

function printResult(name, result) {
  const icon = result.ok ? "✓" : "✗";
  console.log(`${icon} ${name}: ${typeof result.detail === "string" ? result.detail : JSON.stringify(result.detail)}`);
}

function checkStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { ok: false, detail: "STRIPE_SECRET_KEY missing — billing disabled" };
  const prices = [
    process.env.STRIPE_PRICE_PRO_MONTHLY,
    process.env.STRIPE_PRICE_TEAM_MONTHLY,
  ].filter(Boolean);
  return {
    ok: true,
    detail: `configured (${prices.length} price id(s) set; enterprise is admin-assigned)`,
  };
}

function checkSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    return {
      ok: process.env.NODE_ENV !== "production",
      detail: "SESSION_SECRET missing — required in production",
    };
  }
  return { ok: secret.length >= 32, detail: secret.length >= 32 ? "ok" : "use 32+ characters" };
}

function checkDatabase() {
  if (!process.env.DATABASE_URL) {
    return { ok: true, detail: "not set — using JSON store (dev only)" };
  }
  return { ok: true, detail: "DATABASE_URL configured" };
}

function checkEnterpriseSso() {
  const entra = Boolean(
    process.env.ENTRA_TENANT_ID && process.env.ENTRA_CLIENT_ID && process.env.ENTRA_CLIENT_SECRET,
  );
  const okta = Boolean(
    process.env.OKTA_ISSUER && process.env.OKTA_CLIENT_ID && process.env.OKTA_CLIENT_SECRET,
  );
  if (!entra && !okta) {
    return { ok: true, detail: "not configured (optional until Enterprise SSO needed)" };
  }
  return { ok: true, detail: `entra=${entra}, okta=${okta}` };
}

function checkResidency() {
  const deploy = process.env.DEPLOYMENT_REGION ?? "us (default)";
  const enforce = process.env.ENFORCE_DATA_RESIDENCY === "true";
  return {
    ok: true,
    detail: `deployment=${deploy}, enforce=${enforce}, default=${process.env.DEFAULT_DATA_RESIDENCY ?? "us"}`,
  };
}

function checkAdminToken() {
  const token = process.env.ADMIN_TOKEN ?? process.env.BETA_ADMIN_TOKEN;
  if (!token) return { ok: false, detail: "ADMIN_TOKEN or BETA_ADMIN_TOKEN missing" };
  return { ok: true, detail: "admin token configured" };
}

async function main() {
  await loadDotEnv();

  console.log("CodeTruth OS integration check\n");

  printResult("Session secret", checkSessionSecret());
  printResult("Database", checkDatabase());
  printResult("Stripe billing", checkStripe());
  printResult("Admin token", checkAdminToken());
  printResult("Redis (async queue + SSE pub/sub)", await checkRedis());
  printResult("PUBLIC_API_URL (webhooks + CI)", await checkPublicApiUrl());
  printResult("GitHub App (JWT + webhooks)", await checkGitHubApp());
  printResult("Enterprise SSO (Entra/Okta)", checkEnterpriseSso());
  printResult("Data residency policy", checkResidency());
  printResult("LLM Truth Council", await checkLlm());
  printResult("API /health", await checkApiHealth());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});