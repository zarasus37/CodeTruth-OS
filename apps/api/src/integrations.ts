export async function pingRedis(): Promise<boolean> {
  const url = process.env.REDIS_URL;
  if (!url) return false;

  try {
    const { Redis } = await import("ioredis");
    const client = new Redis(url, {
      maxRetriesPerRequest: 0,
      connectTimeout: 2000,
      lazyConnect: true,
      retryStrategy: () => null,
    });
    client.on("error", () => undefined);
    await client.connect();
    const pong = await client.ping();
    await client.quit();
    return pong === "PONG";
  } catch {
    return false;
  }
}