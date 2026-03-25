import { Worker } from "bullmq";
import pLimit from "p-limit";
import "../config/env";
import { prisma } from "../db/prisma";
import { redisConnection } from "../queue/redis.connection";
import { fallbackTasks, plannerAgent } from "../agents/planner.agent";
import { researchAgent } from "../agents/research.agent";
import { smartScraperAgent } from "../agents/smartScraper.agent";
import { summarizerAgent } from "../agents/summarizer.agent";
import { logger } from "../lib/logger";

function normalizeTaskTitle(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeUrl(value: string): string {
  return value.trim().toLowerCase();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function updateJobStage(jobId: string, currentStage: string, status?: string): Promise<void> {
  const data: Record<string, string> = {
    currentStage,
  };

  if (status) {
    data.status = status;
  }

  await prisma.researchJob.update({
    where: { id: jobId },
    data: data as never,
  });
}

const scrapeLimit = pLimit(2);

const MAX_SOURCES = 6;
const MAX_SOURCE_CHARS = 800;
const MAX_FINAL_CHARS = 4000;
const SUMMARIZE_DELAY_MS = 1500;

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const worker = new Worker<{ jobId: string }>(
  "research-queue",
  async (job) => {
    const jobStart = Date.now();
    const { jobId } = job.data ?? {};

    if (!jobId || typeof jobId !== "string") {
      throw new Error("Invalid payload: jobId is required");
    }

    logger.info({ jobId, stage: "worker_started" });

    try {
      const researchJob = await prisma.researchJob.findUnique({
        where: { id: jobId },
        select: { id: true, query: true, status: true },
      });

      if (!researchJob) {
        throw new Error(`ResearchJob not found for id: ${jobId}`);
      }

      await updateJobStage(jobId, "planning", "running");

      logger.info({ jobId, stage: "planner_started" });

      const plannerStart = Date.now();
      let plannedTasks: string[];

      try {
        plannedTasks = await plannerAgent(researchJob.query);
      } catch (error) {
        logger.error({
          jobId,
          stage: "planner_failed",
          error: getErrorMessage(error),
        });
        plannedTasks = fallbackTasks(researchJob.query);
      }

      if (!plannedTasks.length) {
        plannedTasks = fallbackTasks(researchJob.query);
      }

      logger.info({
        jobId,
        stage: "planner_completed",
        taskCount: plannedTasks.length,
        planner_ms: Date.now() - plannerStart,
      });

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
      }

      await updateJobStage(jobId, "research");

      logger.info({ jobId, stage: "research_started" });

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
      let researchMs = 0;
      let scrapeMs = 0;
      let urlsFetched = 0;
      let sourcesStored = 0;

      await updateJobStage(jobId, "scraping");

      logger.info({ jobId, stage: "scraping_started" });

      for (const task of tasksToProcess) {
        try {
          await prisma.researchTask.update({
            where: { id: task.id },
            data: { status: "running" },
          });

          const researchStart = Date.now();
          const results = await researchAgent(task.title);
          researchMs += Date.now() - researchStart;
          urlsFetched += results.length;

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

          const scrapeStart = Date.now();
          const scrapedSources = await Promise.all(
            uniqueResultsForInsert.map((result) =>
              scrapeLimit(async () => {
                try {
                  const scrapedContent = await smartScraperAgent(result.url);
                  const contentToStore = scrapedContent || result.content || "";

                  return {
                    title: result.title,
                    url: result.url,
                    content: contentToStore,
                  };
                } catch (error) {
                  logger.error({
                    jobId,
                    stage: "scraping_failed",
                    taskId: task.id,
                    url: result.url,
                    error: getErrorMessage(error),
                  });
                  return null;
                }
              })
            )
          );
          scrapeMs += Date.now() - scrapeStart;

          const sourcesForInsert = scrapedSources.filter((item): item is { title: string; url: string; content: string } => {
            return item !== null && item.url.trim().length > 0;
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
            sourcesStored += sourcesForInsert.length;
          }

          await prisma.researchTask.update({
            where: { id: task.id },
            data: {
              status: "completed",
              result: `Fetched ${results.length} result(s), stored ${sourcesForInsert.length} new source(s)`,
            },
          });
        } catch (taskError) {
          logger.error({
            jobId,
            stage: "research_failed",
            taskId: task.id,
            error: getErrorMessage(taskError),
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
            logger.error({
              jobId,
              stage: "task_update_failed",
              taskId: task.id,
              error: getErrorMessage(taskUpdateError),
            });
          }
        }
      }

      logger.info({
        jobId,
        stage: "research_completed",
        urlsFetched,
        research_ms: researchMs,
      });

      logger.info({
        jobId,
        stage: "scraping_completed",
        sources: sourcesStored,
        scrape_ms: scrapeMs,
      });

      await updateJobStage(jobId, "summarizing");

      logger.info({ jobId, stage: "summarization_started" });

      const summarizeStart = Date.now();
      const sources = await prisma.researchSource.findMany({
        where: { jobId },
        select: { title: true, url: true, content: true },
      });

      if (sources.length > 0) {
        try {
          const sourcesWithStatus = sources.map((source) => ({
            ...source,
            scrapeSuccess: source.content.trim().length > 0,
          }));
          const validSources = sourcesWithStatus.filter((source) => source.scrapeSuccess);
          const selectedSources = validSources.slice(0, MAX_SOURCES);

          logger.info({
            jobId,
            stage: "summarization_config",
            sources_used: selectedSources.length,
            chars_per_source: MAX_SOURCE_CHARS,
          });

          const sourceSummaries: string[] = [];

          for (const source of selectedSources) {
            const input = source.content.slice(0, MAX_SOURCE_CHARS);
            const summary = await summarizerAgent(input);
            sourceSummaries.push(summary);
            await delay(SUMMARIZE_DELAY_MS);
          }

          const combinedSummary = sourceSummaries.join("\n\n");
          const safeCombined = combinedSummary.slice(0, MAX_FINAL_CHARS);
          const finalReport = await summarizerAgent(safeCombined);

          logger.info({ jobId, stage: "report_persist_start" });

          await prisma.researchReport.upsert({
            where: { jobId },
            update: {
              content: finalReport,
            },
            create: {
              content: finalReport,
              jobId,
            },
          });

          logger.info({ jobId, stage: "report_persist_done" });
          logger.info({
            jobId,
            stage: "summarization_completed",
            combined_summary_length: combinedSummary.length,
            summarize_ms: Date.now() - summarizeStart,
          });
        } catch (error) {
          logger.error({
            jobId,
            stage: "summarization_failed",
            error: getErrorMessage(error),
          });
          throw error;
        }
      } else {
        logger.info({
          jobId,
          stage: "summarization_completed",
          combined_summary_length: 0,
          summarize_ms: Date.now() - summarizeStart,
        });
      }

      await updateJobStage(jobId, "completed", "completed");

      logger.info({ jobId, stage: "job_completed" });
    } catch (error) {
      logger.error({
        jobId,
        stage: "job_failed",
        error: getErrorMessage(error),
      });

      try {
        await prisma.researchJob.update({
          where: { id: jobId },
          data: {
            status: "failed",
          },
        });
      } catch (updateError) {
        logger.error({
          jobId,
          stage: "job_status_update_failed",
          error: getErrorMessage(updateError),
        });
      }
    } finally {
      logger.info({
        jobId,
        stage: "total_job_time",
        total_job_ms: Date.now() - jobStart,
      });
    }
  },
  {
    connection: redisConnection,
  }
);

worker.on("completed", (job) => {
  logger.info({
    jobId: job.data?.jobId,
    stage: "worker_event_completed",
  });
});

worker.on("failed", (job, err) => {
  logger.error({
    jobId: job?.data?.jobId,
    stage: "worker_event_failed",
    error: err.message,
  });
});

worker.on("error", (error) => {
  logger.error({
    jobId: null,
    stage: "worker_error",
    error: getErrorMessage(error),
  });
});

logger.info({
  jobId: null,
  stage: "worker_booted",
});
