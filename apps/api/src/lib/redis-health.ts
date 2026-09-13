import { Redis } from "ioredis";
import { appConfig } from "../config.js";

export async function isRedisReady(): Promise<boolean> {
  if (!appConfig.infra.redisRequired) {
    return true;
  }

  const client = new Redis(appConfig.redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    lazyConnect: true,
  });
  try {
    await client.connect();
    await client.ping();
    return true;
  } catch {
    return false;
  } finally {
    client.disconnect();
  }
}
