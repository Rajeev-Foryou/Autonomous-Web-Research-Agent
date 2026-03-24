import { Worker } from "bullmq";
import pLimit from "p-limit";
import "../config/env";
import { prisma } from "../db/prisma";
import { redisConnection } from "../queue/redis.connection";
import { fallbackTasks, plannerAgent } from "../agents/planner.agent";
import { researchAgent } from "../agents/research.agent";
import { smartScraperAgent } from "../agents/smartScraper.agent";

function normalizeTaskTitle(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeUrl(value: string): string {
  return value.trim().toLowerCase();
}

const scrapeLimit = pLimit(2);

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

      let plannedTasks = await plannerAgent(researchJob.query);

      if (!plannedTasks.length) {
        console.warn("[worker] planner returned no tasks; falling back", {
          queueJobId: job.id,
          researchJobId: jobId,
        });
        plannedTasks = fallbackTasks(researchJob.query);
      }

      const existingTasks = await prisma.researchTask.findMany({
        where: { jobId },
        select: {
          id: true,
          title: true,
          status: true,
        },
      });

      const existingTaskTitleSet = new Set(existingTasks.map((task) => normalizeTaskTitle(task.title)));
      const newTaskTitles: string[] = [];

      for (const taskTitle of plannedTasks) {
        const normalizedTitle = normalizeTaskTitle(taskTitle);

        if (!normalizedTitle || existingTaskTitleSet.has(normalizedTitle)) {
          continue;
        }

        existingTaskTitleSet.add(normalizedTitle);
        newTaskTitles.push(taskTitle.trim());
      }

      if (newTaskTitles.length > 0) {
        await prisma.researchTask.createMany({
          data: newTaskTitles.map((title) => ({
            title,
            status: "pending",
            jobId,
          })),
        });

        console.log("[worker] inserted planned tasks", {
          queueJobId: job.id,
          researchJobId: jobId,
          insertedTaskCount: newTaskTitles.length,
        });
      } else {
        console.log("[worker] no new tasks to insert", {
          queueJobId: job.id,
          researchJobId: jobId,
        });
      }

      const tasksToProcess = await prisma.researchTask.findMany({
        where: {
          jobId,
          status: {
            not: "completed",
          },
        },
        select: {
          id: true,
          title: true,
          status: true,
        },
        orderBy: {
          id: "asc",
        },
      });

      const existingSourceRows = await prisma.researchSource.findMany({
        where: { jobId },
        select: { url: true },
      });

      const existingSourceUrlSet = new Set(existingSourceRows.map((row) => normalizeUrl(row.url)));

      for (const task of tasksToProcess) {
        console.log("[worker] task started", {
          queueJobId: job.id,
          researchJobId: jobId,
          taskId: task.id,
          task: task.title,
        });

        try {
          await prisma.researchTask.update({
            where: { id: task.id },
            data: { status: "running" },
          });

          const results = await researchAgent(task.title);

          console.log("[worker] task fetched results", {
            queueJobId: job.id,
            researchJobId: jobId,
            taskId: task.id,
            task: task.title,
            fetchedCount: results.length,
          });

          if (results.length === 0) {
            await prisma.researchTask.update({
              where: { id: task.id },
              data: {
                status: "completed",
                result: "No results returned from research provider",
              },
            });
            continue;
          }

          const uniqueResultsForInsert = results.filter((result) => {
            const normalizedResultUrl = normalizeUrl(result.url);

            if (!normalizedResultUrl || existingSourceUrlSet.has(normalizedResultUrl)) {
              return false;
            }

            existingSourceUrlSet.add(normalizedResultUrl);
            return true;
          });

          console.log("[worker] scraping started", {
            queueJobId: job.id,
            researchJobId: jobId,
            taskId: task.id,
            task: task.title,
            candidateCount: uniqueResultsForInsert.length,
          });

          const scrapedSources = await Promise.all(
            uniqueResultsForInsert.map((result) =>
              scrapeLimit(async () => {
                const scrapedContent = await smartScraperAgent(result.url);
                const contentToStore = scrapedContent || result.content || "";

                return {
                  title: result.title,
                  url: result.url,
                  content: contentToStore,
                };
              })
            )
          );

          const sourcesForInsert = scrapedSources.filter((item) => {
            return item.url.trim().length > 0;
          });

          console.log("[worker] storing task sources", {
            queueJobId: job.id,
            researchJobId: jobId,
            taskId: task.id,
            task: task.title,
            insertCount: sourcesForInsert.length,
          });

          if (sourcesForInsert.length > 0) {
            await prisma.researchSource.createMany({
              data: sourcesForInsert.map((result) => ({
                jobId,
                title: result.title,
                url: result.url,
                content: result.content,
              })),
            });
          }

          await prisma.researchTask.update({
            where: { id: task.id },
            data: {
              status: "completed",
              result: `Fetched ${results.length} result(s), stored ${sourcesForInsert.length} new source(s)`,
            },
          });
        } catch (taskError) {
          console.error("[worker] task processing failed", {
            queueJobId: job.id,
            researchJobId: jobId,
            taskId: task.id,
            task: task.title,
            taskError,
          });

          try {
            await prisma.researchTask.update({
              where: { id: task.id },
              data: {
                status: "failed",
                result: "Task processing failed",
              },
            });
          } catch (taskUpdateError) {
            console.error("[worker] failed to mark task as failed", {
              queueJobId: job.id,
              researchJobId: jobId,
              taskId: task.id,
              taskUpdateError,
            });
          }
        }
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