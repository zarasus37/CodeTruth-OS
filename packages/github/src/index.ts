import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { extract } from "tar";

export interface GitHubPushEvent {
  ref: string;
  repository: {
    full_name: string;
    name: string;
    owner: { login: string };
    default_branch?: string;
  };
}

export function generateWebhookSecret(): string {
  return randomBytes(24).toString("hex");
}

export function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expected = `sha256=${digest}`;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signatureHeader);
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function parsePushEvent(payload: GitHubPushEvent): {
  owner: string;
  repo: string;
  branch: string;
} {
  const branch = payload.ref.replace(/^refs\/heads\//, "");
  return {
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    branch,
  };
}

export * from "./app-auth.js";

export async function downloadRepositoryArchive(options: {
  owner: string;
  repo: string;
  ref: string;
  token?: string;
  installationId?: number;
}): Promise<string> {
  let token = options.token;
  if (!token && options.installationId) {
    const { getInstallationAccessToken } = await import("./app-auth.js");
    token = await getInstallationAccessToken(options.installationId);
  }
  const url = `https://api.github.com/repos/${options.owner}/${options.repo}/tarball/${options.ref}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "CodeTruth-OS",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers, redirect: "follow" });
  if (!response.ok) {
    throw new Error(`GitHub archive download failed (${response.status})`);
  }
  if (!response.body) {
    throw new Error("GitHub archive response had no body");
  }

  const tempRoot = await mkdtemp(path.join(tmpdir(), "codetruth-github-"));
  const archivePath = path.join(tempRoot, "archive.tar.gz");
  await pipeline(response.body as unknown as NodeJS.ReadableStream, createWriteStream(archivePath));
  await extract({ file: archivePath, cwd: tempRoot, strip: 1 });

  await rm(archivePath, { force: true });
  const entries = await readdir(tempRoot);
  if (entries.length === 1) {
    const nested = path.join(tempRoot, entries[0]!);
    return nested;
  }
  return tempRoot;
}