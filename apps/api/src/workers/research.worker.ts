import { Worker } from "bullmq";
import pLimit from "p-limit";
import "../config/env";
import { prisma } from "../db/prisma";
import { redisConnection } from "../queue/redis.connection";
import { fallbackTasks, plannerAgent } from "../agents/planner.agent";
import { researchAgent } from "../agents/research.agent";
import { smartScraperAgent } from "../agents/smartScraper.agent";
import { criticAgent } from "../agents/critic.agent";
import { groqClient, groqTimeoutMs } from "../ai/groq.client";
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

type ToolData = {
  name: string;
  pricing: string;
  features: string[];
  pros: string[];
  cons: string[];
};

function extractJsonArray(raw: string): string {
  const trimmed = raw.trim();

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

  if (fencedMatch?.[1]) {
    const candidate = fencedMatch[1].trim();

    if (candidate.startsWith("[") && candidate.endsWith("]")) {
      return candidate;
    }
  }

  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");

  if (firstBracket >= 0 && lastBracket > firstBracket) {
    return trimmed.slice(firstBracket, lastBracket + 1).trim();
  }

  return "[]";
}

function normalizeToolEntry(value: unknown): ToolData | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    name?: unknown;
    pricing?: unknown;
    features?: unknown;
    pros?: unknown;
    cons?: unknown;
  };

  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";

  if (!name) {
    return null;
  }

  const pricing = typeof candidate.pricing === "string" ? candidate.pricing.trim() : "Unknown";

  const toStringArray = (input: unknown): string[] => {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  };

  return {
    name,
    pricing,
    features: toStringArray(candidate.features),
    pros: toStringArray(candidate.pros),
    cons: toStringArray(candidate.cons),
  };
}

function mergeUniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function mergeTools(dataArray: ToolData[][]): ToolData[] {
  const merged = new Map<string, ToolData>();

  for (const toolList of dataArray) {
    for (const tool of toolList) {
      const key = tool.name.trim().toLowerCase();

      if (!key) {
        continue;
      }

      const existing = merged.get(key);

      if (!existing) {
        merged.set(key, {
          name: tool.name.trim(),
          pricing: tool.pricing.trim() || "Unknown",
          features: mergeUniqueStrings(tool.features),
          pros: mergeUniqueStrings(tool.pros),
          cons: mergeUniqueStrings(tool.cons),
        });
        continue;
      }

      existing.features = mergeUniqueStrings(existing.features.concat(tool.features));
      existing.pros = mergeUniqueStrings(existing.pros.concat(tool.pros));
      existing.cons = mergeUniqueStrings(existing.cons.concat(tool.cons));

      const candidatePricing = tool.pricing.trim();
      if (existing.pricing === "Unknown" && candidatePricing) {
        existing.pricing = candidatePricing;
      }
    }
  }

  return Array.from(merged.values());
}

function isCodingTool(tool: ToolData): boolean {
  const name = tool.name.toLowerCase();

  return (
    name.includes("code") ||
    tool.features.some((feature) => feature.toLowerCase().includes("code")) ||
    tool.features.some((feature) => feature.toLowerCase().includes("developer"))
  );
}

function validateReport(report: string): boolean {
  const content = report.trim();

  return (
    content.length > 900 &&
    /pricing/i.test(content) &&
    /pros/i.test(content) &&
    /cons/i.test(content) &&
    content.includes("|")
  );
}

async function extractToolData(content: string): Promise<ToolData[]> {
  const response = await groqClient.chat.completions.create(
    {
      model: "llama-3.1-8b-instant",
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: [
            "Extract AI coding tools from the content.",
            "Return STRICT JSON:",
            "[",
            "{",
            '"name": "",',
            '"pricing": "",',
            '"features": [],',
            '"pros": [],',
            '"cons": []',
            "}",
            "]",
            "Rules:",
            "* ONLY include AI coding tools",
            "* Ignore irrelevant tools",
            "* No explanation text",
            "* No markdown",
            "* Return JSON only",
          ].join("\n"),
        },
        {
          role: "user",
          content,
        },
      ],
    },
    {
      timeout: groqTimeoutMs,
    }
  );

  const raw = response.choices?.[0]?.message?.content;
  const rawText = typeof raw === "string" ? raw.trim() : "";

  if (!rawText) {
    return [];
  }

  try {
    const parsed = JSON.parse(extractJsonArray(rawText));

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => normalizeToolEntry(entry))
      .filter((entry): entry is ToolData => entry !== null);
  } catch {
    return [];
  }
}

async function generateReportFromTools(tools: ToolData[]): Promise<string> {
  const response = await groqClient.chat.completions.create(
    {
      model: "llama-3.1-8b-instant",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: [
            "Generate a professional AI coding tools comparison report using this JSON data:",
            JSON.stringify(tools),
            "",
            "Requirements:",
            "* Minimum 900 words",
            "* MUST include pricing",
            "* MUST include pros and cons for each tool",
            "* MUST include a comparison table",
            "* No repetition",
            "* No generic statements",
            "",
            "Structure:",
            "1. Title",
            "2. Key Insights",
            "3. Comparison Table (MANDATORY)",
            "4. Detailed Tool Breakdown",
            "5. Best Tools by Use Case",
            "6. Conclusion",
          ].join("\n"),
        },
      ],
    },
    {
      timeout: groqTimeoutMs,
    }
  );

  const content = response.choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}

async function regenerateReport(tools: ToolData[]): Promise<string> {
  const response = await groqClient.chat.completions.create(
    {
      model: "llama-3.1-8b-instant",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: [
            "Regenerate the report from this JSON and strictly satisfy all constraints.",
            JSON.stringify(tools),
            "",
            "Hard constraints:",
            "* Minimum 900 words",
            "* Include clear Pricing sections",
            "* Include explicit Pros and Cons for every tool",
            "* Include a markdown comparison table using pipe characters",
            "* Remove generic statements and repetition",
            "",
            "Structure:",
            "1. Title",
            "2. Key Insights",
            "3. Comparison Table",
            "4. Detailed Tool Breakdown",
            "5. Best Tools by Use Case",
            "6. Conclusion",
          ].join("\n"),
        },
      ],
    },
    {
      timeout: groqTimeoutMs,
    }
  );

  const content = response.choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
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

const scrapeLimit = pLimit(4);
const extractionLimit = pLimit(3);

const MAX_SOURCES = 4;
const MAX_SOURCE_CHARS = 800;

const worker = new Worker<{ jobId: string; query: string }>(
  "research-queue",
  async (job) => {
    const jobStart = Date.now();
    const { jobId, query } = job.data ?? {};

    let researchMs = 0;
    let scrapeMs = 0;
    let summarizeMs = 0;
    let urlsFetched = 0;
    let sourcesStored = 0;

    if (!jobId || typeof jobId !== "string") {
      throw new Error("Invalid payload: jobId is required");
    }

    if (!query || typeof query !== "string") {
      throw new Error("Invalid payload: query is required");
    }

    logger.info({ jobId, stage: "worker_started" });

    try {
      try {
        await prisma.researchJob.create({
          data: {
            id: jobId,
            query,
            status: "running",
            currentStage: "planning",
          },
        });
      } catch (error) {
        const message = getErrorMessage(error);

        if (message.includes("Unique constraint") || message.includes("duplicate")) {
          await prisma.researchJob.update({
            where: { id: jobId },
            data: {
              query,
              status: "running",
              currentStage: "planning",
            },
          });
        } else {
          throw error;
        }
      }

      await updateJobStage(jobId, "planning", "running");

      logger.info({ jobId, stage: "planner_started" });

      const plannerStart = Date.now();
      let plannedTasks: string[];

      try {
        plannedTasks = await plannerAgent(query);
      } catch (error) {
        logger.error({
          jobId,
          stage: "planner_failed",
          error: getErrorMessage(error),
        });
        plannedTasks = fallbackTasks(query);
      }

      if (!plannedTasks.length) {
        plannedTasks = fallbackTasks(query);
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
          const scrapedResults = await Promise.all(
            uniqueResultsForInsert.map((result) =>
              scrapeLimit(async () => {
                try {
                  const scraped = await smartScraperAgent(result.url);
                  const contentToStore = scraped.content || result.content || "";

                  logger.info({
                    jobId,
                    stage: "scrape_result",
                    taskId: task.id,
                    url: result.url,
                    method: scraped.method,
                    contentLength: contentToStore.length,
                  });

                  return {
                    title: result.title,
                    url: result.url,
                    content: contentToStore,
                  };
                } catch (error) {
                  logger.error({
                    jobId,
                    stage: "scrape_failed",
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

          const sourcesForInsert = scrapedResults.filter((item): item is { title: string; url: string; content: string } => {
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
              result: "Fetched " + results.length + " result(s), stored " + sourcesForInsert.length + " new source(s)",
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

      try {
        const validSources = sources.filter((source) => source.content.trim().length > 0);
        const selectedSources = validSources.slice(0, MAX_SOURCES);

        logger.info({
          jobId,
          stage: "summarization_config",
          sources_used: selectedSources.length,
          chars_per_source: MAX_SOURCE_CHARS,
        });

        logger.info({ jobId, stage: "extraction_started" });

        const extractedData = await Promise.all(
          selectedSources.map((source) =>
            extractionLimit(async () => {
              const input = source.content.slice(0, MAX_SOURCE_CHARS);
              return extractToolData(input);
            })
          )
        );

        let tools = mergeTools(extractedData);
        tools = tools.filter((tool) => isCodingTool(tool));

        if (tools.length < 3) {
          throw new Error("Insufficient relevant tool data");
        }

        logger.info({
          jobId,
          stage: "extraction_completed",
          toolsCount: tools.length,
        });

        let finalOutput = await generateReportFromTools(tools);

        if (!validateReport(finalOutput)) {
          logger.info({ jobId, stage: "report_retry" });
          finalOutput = await regenerateReport(tools);
        }

        if (!validateReport(finalOutput)) {
          throw new Error("Report validation failed after retry");
        }

        summarizeMs = Date.now() - summarizeStart;

        logger.info({
          jobId,
          stage: "report_generated",
          length: finalOutput.length,
        });

        logger.info({
          jobId,
          stage: "summarization_completed",
          combined_summary_length: finalOutput.length,
          summarize_ms: summarizeMs,
        });

        await updateJobStage(jobId, "critic");

        logger.info({ jobId, stage: "critic_started" });

        const criticResult = await criticAgent(finalOutput);

        logger.info({
          jobId,
          stage: "critic_completed",
          score: criticResult.score,
          issues_count: criticResult.issues.length,
          improved: !!criticResult.improvedReport,
        });

        if (criticResult.improvedReport) {
          finalOutput = criticResult.improvedReport;
        }

        logger.info({ jobId, stage: "report_persist_start" });

        await prisma.researchReport.upsert({
          where: { jobId },
          update: {
            content: finalOutput,
          },
          create: {
            content: finalOutput,
            jobId,
          },
        });

        logger.info({ jobId, stage: "report_persist_done" });
      } catch (error) {
        logger.error({
          jobId,
          stage: "summarization_failed",
          error: getErrorMessage(error),
        });
        throw error;
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
            currentStage: "failed",
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
      const totalJobMs = Date.now() - jobStart;

      logger.info({
        jobId,
        stage: "timing",
        research_ms: researchMs,
        scrape_ms: scrapeMs,
        summarize_ms: summarizeMs,
        total_job_ms: totalJobMs,
      });

      logger.info({
        jobId,
        stage: "total_job_time",
        total_job_ms: totalJobMs,
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
