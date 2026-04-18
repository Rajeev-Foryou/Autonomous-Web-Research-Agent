import type { RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import Redis from "ioredis";
import { RedisStore, type RedisReply } from "rate-limit-redis";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import { redisOptions } from "../queue/redis.connection";

let rateLimitRedisClient: Redis | null = null;

export function createApiRateLimiter(): RequestHandler {
  if (!rateLimitRedisClient) {
    rateLimitRedisClient = new Redis(redisOptions);
    rateLimitRedisClient.on("error", (error) => {
      logger.error({
        jobId: null,
        stage: "rate_limit_redis_error",
        error: error.message,
      });
    });
  }

  return rateLimit({
    windowMs: env.rateLimitWindowMs,
    limit: env.rateLimitMaxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Too many requests. Please try again later.",
      code: "RATE_LIMITED",
    },
    store: new RedisStore({
      prefix: "rate-limit:api:",
      sendCommand: (...args: string[]) => {
        if (!rateLimitRedisClient) {
          return Promise.reject(new Error("Rate limit Redis client is not initialized"));
        }

        return rateLimitRedisClient.call(args[0], ...args.slice(1)) as Promise<RedisReply>;
      },
    }),
  });
}

export async function shutdownApiRateLimiter(): Promise<void> {
  if (!rateLimitRedisClient) {
    return;
  }

  try {
    await rateLimitRedisClient.quit();
  } catch {
    rateLimitRedisClient.disconnect();
  } finally {
    rateLimitRedisClient = null;
  }
}
