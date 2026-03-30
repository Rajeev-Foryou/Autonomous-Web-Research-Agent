import { Request, Response } from "express";
import Redis from "ioredis";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";

export const getHealth = async (_req: Request, res: Response): Promise<void> => {
  let redis: Redis | null = null;

  try {
    await prisma.$executeRawUnsafe("SELECT 1");

    redis = new Redis(env.redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });

    await redis.ping();

    res.status(200).json({
      status: "ok",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Health check failed";

    res.status(503).json({
      error: message,
      code: "HEALTH_CHECK_FAILED",
    });
  } finally {
    if (redis) {
      await redis.quit().catch(() => undefined);
    }
  }
};
