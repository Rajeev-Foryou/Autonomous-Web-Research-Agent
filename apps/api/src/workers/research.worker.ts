import { Worker } from "bullmq";
import "../config/env";
import { prisma } from "../db/prisma";
import { redisConnection } from "../queue/redis.connection";

const worker = new Worker<{ jobId: string }>(
  "research-queue",
  async (job) => {
    const { jobId } = job.data ?? {};

    if (!jobId || typeof jobId !== "string") {
      throw new Error("Invalid payload: jobId is required");
    }

    console.log("[worker] starting research job", {
      queueJobId: job.id,
      researchJobId: jobId,
      name: job.name,
    });

    try {
      await prisma.researchJob.update({
        where: { id: jobId },
        data: { status: "running" },
      });

      // Simulated async work until planner/research agent execution is integrated.
      await new Promise((resolve) => setTimeout(resolve, 1200));

      await prisma.researchJob.update({
        where: { id: jobId },
        data: { status: "completed" },
      });

      console.log("[worker] research job completed", {
        queueJobId: job.id,
        researchJobId: jobId,
      });
    } catch (error) {
      console.error("[worker] research job processing failed", {
        queueJobId: job.id,
        researchJobId: jobId,
        error,
      });

      await prisma.researchJob.update({
        where: { id: jobId },
        data: { status: "failed" },
      });

      throw error;
    }
  },
  {
    connection: redisConnection,
  }
);

worker.on("completed", (job) => {
  console.log("[worker:event] completed", {
    queueJobId: job.id,
    researchJobId: job.data?.jobId,
  });
});

worker.on("failed", (job, err) => {
  console.error("[worker:event] failed", {
    queueJobId: job?.id,
    researchJobId: job?.data?.jobId,
    message: err.message,
  });
});

worker.on("error", (error) => {
  console.error("[worker:event] worker error", error);
});

console.log("[worker] research worker started and waiting for jobs");