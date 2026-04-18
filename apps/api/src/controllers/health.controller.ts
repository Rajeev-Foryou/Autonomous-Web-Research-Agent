import { Request, Response } from "express";
import Redis from "ioredis";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { redisOptions } from "../queue/redis.connection";

export const getHealth = async (_req: Request, res: Response): Promise<void> => {
  let redis: Redis | null = null;

  try {
    await prisma.$executeRawUnsafe("SELECT 1");

    redis = new Redis(redisOptions);
    redis.on("error", (error) => {
      logger.error({
        jobId: null,
        stage: "health_redis_error",
        error: error.message,
      });
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
