import { createSign, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

export interface GitHubAppConfig {
  appId: string;
  privateKey: string;
  webhookSecret?: string;
}

export function isGitHubAppEnabled(): boolean {
  const appId = process.env.GITHUB_APP_ID;
  const hasKey = Boolean(process.env.GITHUB_APP_PRIVATE_KEY || process.env.GITHUB_APP_PRIVATE_KEY_PATH);
  return Boolean(appId && appId !== "000000" && appId !== "0" && hasKey);
}

export function getGitHubAppInstallUrl(slug?: string): string | null {
  const appSlug = slug ?? process.env.GITHUB_APP_SLUG;
  if (!appSlug) return null;
  return `https://github.com/apps/${appSlug}/installations/new`;
}

export async function loadGitHubAppConfig(): Promise<GitHubAppConfig | null> {
  const appId = process.env.GITHUB_APP_ID;
  if (!appId) return null;

  let privateKey = process.env.GITHUB_APP_PRIVATE_KEY ?? "";
  if (!privateKey && process.env.GITHUB_APP_PRIVATE_KEY_PATH) {
    privateKey = await readFile(process.env.GITHUB_APP_PRIVATE_KEY_PATH, "utf8");
  }
  privateKey = privateKey.replace(/\\n/g, "\n");
  if (!privateKey) return null;

  return {
    appId,
    privateKey,
    webhookSecret: process.env.GITHUB_APP_WEBHOOK_SECRET,
  };
}

function base64Url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64url");
}

export function createGitHubAppJwt(config: GitHubAppConfig): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iat: now - 60,
      exp: now + 9 * 60,
      iss: config.appId,
      jti: randomUUID(),
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(config.privateKey, "base64url");
  return `${unsigned}.${signature}`;
}

export async function getInstallationAccessToken(installationId: number): Promise<string> {
  const config = await loadGitHubAppConfig();
  if (!config) throw new Error("GitHub App is not configured");

  const jwt = createGitHubAppJwt(config);
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "CodeTruth-OS",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`GitHub installation token failed (${response.status})`);
  }

  const payload = (await response.json()) as { token?: string };
  if (!payload.token) throw new Error("GitHub installation token missing");
  return payload.token;
}

export interface GitHubInstallationEvent {
  action: string;
  installation: { id: number; account?: { login?: string } };
  repositories?: Array<{ name: string; full_name?: string }>;
}

export function parseInstallationEvent(payload: GitHubInstallationEvent): {
  installationId: number;
  account?: string;
  repositories: string[];
} {
  return {
    installationId: payload.installation.id,
    account: payload.installation.account?.login,
    repositories: (payload.repositories ?? []).map((r) => r.name),
  };
}