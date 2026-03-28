import type { ConnectionOptions } from "bullmq";
import { env } from "../config/env";

function parseRedisUrl(redisUrl: string): ConnectionOptions {
  const parsed = new URL(redisUrl);

  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
    throw new Error("REDIS_URL must use redis:// or rediss:// protocol");
  }

  const dbPath = parsed.pathname?.replace("/", "");
  const db = dbPath ? Number(dbPath) : 0;

  if (Number.isNaN(db)) {
    throw new Error("REDIS_URL contains an invalid database index");
  }

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
    retryStrategy: (times: number) => Math.min(times * 100, 3000),
  };
}

export const redisConnection: ConnectionOptions = parseRedisUrl(env.redisUrl);
