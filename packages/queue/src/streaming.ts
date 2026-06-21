import type { PipelineStreamEvent } from "@codetruth/core";
import { Redis } from "ioredis";
import { isQueueEnabled } from "./index.js";

const publishers = new Map<string, Redis>();
const subscribers = new Map<string, Redis>();

function channel(analysisId: string): string {
  return `codetruth:analysis:${analysisId}:stream`;
}

function redisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not configured");
  return url;
}

export function isStreamPubSubEnabled(): boolean {
  return isQueueEnabled();
}

export async function publishStreamEvent(event: PipelineStreamEvent): Promise<void> {
  if (!isQueueEnabled()) return;
  let client = publishers.get("default");
  if (!client) {
    client = new Redis(redisUrl(), { maxRetriesPerRequest: null });
    publishers.set("default", client);
  }
  await client.publish(channel(event.analysisId), JSON.stringify(event));
}

export function subscribeStreamEvents(
  analysisId: string,
  handler: (event: PipelineStreamEvent) => void,
): () => Promise<void> {
  const sub = new Redis(redisUrl(), { maxRetriesPerRequest: null });
  subscribers.set(analysisId, sub);

  void sub.subscribe(channel(analysisId));
  sub.on("message", (_ch, message) => {
    try {
      handler(JSON.parse(message) as PipelineStreamEvent);
    } catch {
      // ignore malformed
    }
  });

  return async () => {
    await sub.unsubscribe(channel(analysisId));
    await sub.quit();
    subscribers.delete(analysisId);
  };
}

export async function closeStreamConnections(): Promise<void> {
  for (const client of publishers.values()) await client.quit();
  for (const client of subscribers.values()) await client.quit();
  publishers.clear();
  subscribers.clear();
}