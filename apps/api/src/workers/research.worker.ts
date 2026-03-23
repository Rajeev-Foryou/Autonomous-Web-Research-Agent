import { Worker } from "bullmq";
import "../config/env";
import { prisma } from "../db/prisma";
import { redisConnection } from "../queue/redis.connection";
import { fallbackTasks, plannerAgent } from "../agents/planner.agent";

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
      const researchJob = await prisma.researchJob.findUnique({
        where: { id: jobId },
        select: { id: true, query: true, status: true },
      });

      if (!researchJob) {
        throw new Error(`ResearchJob not found for id: ${jobId}`);
      }

      await prisma.researchJob.update({
        where: { id: jobId },
        data: { status: "running" },
      });

      const existingTaskCount = await prisma.researchTask.count({
        where: { jobId },
      });

      if (existingTaskCount === 0) {
        let tasks = await plannerAgent(researchJob.query);

        if (!tasks.length) {
          console.warn("[worker] planner returned no tasks; falling back", {
            queueJobId: job.id,
            researchJobId: jobId,
          });
          tasks = fallbackTasks(researchJob.query);
        }

        await prisma.researchTask.createMany({
          data: tasks.map((title) => ({
            title,
            status: "pending",
            jobId,
          })),
        });
      } else {
        console.log("[worker] tasks already exist for job; skipping insertion", {
          queueJobId: job.id,
          researchJobId: jobId,
          existingTaskCount,
        });
      }

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

      try {
        await prisma.researchJob.update({
          where: { id: jobId },
          data: { status: "failed" },
        });
      } catch (updateError) {
        console.error("[worker] failed to update job status to failed", {
          queueJobId: job.id,
          researchJobId: jobId,
          updateError,
        });
      }
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