import cors from "cors";
import express from "express";
import healthRouter from "./routes/health.routes";
import researchRoutes from "./routes/research.routes";
import { env } from "./config/env";
import { ensureDatabaseReady, prisma } from "./bootstrap/db";
import { logger } from "./lib/logger";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/", healthRouter);
app.use("/", researchRoutes);

async function startApiServer(): Promise<void> {
  try {
    await ensureDatabaseReady();

    const server = app.listen(env.port, () => {
      // Keep startup logs structured for container and cloud runtimes.
      console.log("API listening on port " + env.port + " (" + env.nodeEnv + ")");
    });

    const shutdown = async () => {
      server.close(async () => {
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
    console.error("api_bootstrap_failed: " + message);
    process.exit(1);
  }
}

void startApiServer();
