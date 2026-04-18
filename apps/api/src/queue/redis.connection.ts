import type { ConnectionOptions } from "bullmq";
import type { RedisOptions } from "ioredis";
import { env } from "../config/env";

const REDIS_RETRY_DELAY_CAP_MS = 3000;

function parseRedisUrl(redisUrl: string): RedisOptions {
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
    enableReadyCheck: false,
    connectTimeout: 10000,
    keepAlive: 10000,
    retryStrategy: (times: number) => Math.min(times * 100, REDIS_RETRY_DELAY_CAP_MS),
    reconnectOnError: (error: Error) => {
      const message = error.message.toLowerCase();

      return message.includes("econnreset") || message.includes("etimedout");
    },
  };
}

export const redisOptions: RedisOptions = parseRedisUrl(env.redisUrl);

export const redisConnection: ConnectionOptions = redisOptions as ConnectionOptions;
