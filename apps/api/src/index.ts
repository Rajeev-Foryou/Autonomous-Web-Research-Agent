import cors from "cors";
import express from "express";
import healthRouter from "./routes/health.routes";
import researchRoutes from "./routes/research.routes";
import { env } from "./config/env";
import { ensureDatabaseReady, prisma } from "./bootstrap/db";
import { logger } from "./lib/logger";
import { createApiRateLimiter, shutdownApiRateLimiter } from "./middleware/rateLimit.middleware";

const app = express();

app.set("trust proxy", 1);

const corsOrigins = new Set(env.corsAllowedOrigins);

app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (corsOrigins.size === 0 || corsOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Not allowed by CORS"));
  },
}));
app.use(express.json());
app.use("/", healthRouter);

if (env.rateLimitEnabled) {
  app.use("/", createApiRateLimiter(), researchRoutes);
} else {
  logger.warn({
    stage: "api_rate_limit_disabled",
  });
  app.use("/", researchRoutes);
}

async function startApiServer(): Promise<void> {
  try {
    await ensureDatabaseReady({
      runMigrations: env.runMigrationsOnBoot,
    });

    const server = app.listen(env.port, () => {
      // Keep startup logs structured for container and cloud runtimes.
      logger.info({
        stage: "api_booted",
        port: env.port,
        nodeEnv: env.nodeEnv,
        rateLimitEnabled: env.rateLimitEnabled,
        rateLimitWindowMs: env.rateLimitWindowMs,
        rateLimitMaxRequests: env.rateLimitMaxRequests,
      });
    });

    const shutdown = async () => {
      server.close(async () => {
        await shutdownApiRateLimiter().catch(() => undefined);
        await prisma.$disconnect().catch(() => undefined);
        process.exit(0);
      });
    };

    process.once("SIGINT", () => {
      void shutdown();
    });

    process.once("SIGTERM", () => {
      void shutdown();
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({
      stage: "api_bootstrap_failed",
      error: message,
    });
    process.exit(1);
  }
}

void startApiServer();
