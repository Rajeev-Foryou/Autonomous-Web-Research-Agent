import { Worker } from "bullmq";
import pLimit from "p-limit";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { redisConnection } from "../queue/redis.connection";
import { fallbackTasks, plannerAgent } from "../agents/planner.agent";
import { researchAgent } from "../agents/research.agent";
import { smartScraperAgent } from "../agents/smartScraper.agent";
import { criticAgent } from "../agents/critic.agent";
import { buildSummarizerPrompt } from "../agents/prompts/summarizer.prompt";
import { buildFallbackReport as buildStructuredFallbackReport } from "../agents/utils/fallbackReport";
import { parseStructuredReport, StructuredReport } from "../agents/utils/parseStructuredReport";
import { groqClient, groqTimeoutMs } from "../ai/groq.client";
import { logger } from "../lib/logger";
import { tokenCount, truncateToTokenLimit } from "../utils/token.util";
import { Status } from "../types/status";
import { ensureDatabaseReady } from "../bootstrap/db";

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

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "for",
  "of",
  "to",
  "in",
  "on",
  "with",
  "by",
  "is",
  "are",
  "from",
  "best",
]);

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

function validateReport(report: string): boolean {
  const content = report.trim();

  return content.length > 600 && /insight/i.test(content) && /comparison/i.test(content) && /conclusion/i.test(content);
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getQueryTerms(query: string): string[] {
  return normalizeText(query)
    .split(" ")
    .filter((term) => term.length >= 3 && !STOPWORDS.has(term));
}

function scoreSourceRelevance(query: string, source: { title: string; content: string }): number {
  const terms = getQueryTerms(query);

  if (terms.length === 0) {
    return 0;
  }

  const haystack = normalizeText(source.title + " " + source.content.slice(0, 1600));
  let score = 0;

  for (const term of terms) {
    if (haystack.includes(term)) {
      score += source.title.toLowerCase().includes(term) ? 3 : 1;
    }
  }

  return score;
}

function pickRelevantSources(
  query: string,
  sources: Array<{ title: string; url: string; content: string }>,
  maxCount: number
): Array<{ title: string; url: string; content: string }> {
  const ranked = sources
    .map((source) => ({
      source,
      score: scoreSourceRelevance(query, source),
    }))
    .sort((a, b) => b.score - a.score);

  const withScore = ranked.filter((item) => item.score > 0).map((item) => item.source);

  if (withScore.length >= 2) {
    return withScore.slice(0, maxCount);
  }

  return sources.slice(0, maxCount);
}

function isRateLimitError(error: unknown): boolean {
  const candidate = error as {
    status?: number;
    code?: string;
    error?: { code?: string; message?: string };
    message?: string;
  };

  const message = (candidate?.message || candidate?.error?.message || "").toLowerCase();

  return (
    candidate?.status === 429 ||
    candidate?.code === "rate_limit_exceeded" ||
    candidate?.error?.code === "rate_limit_exceeded" ||
    message.includes("rate limit")
  );
}

async function withRateLimitRetry<T>(operation: () => Promise<T>, retries = 3): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isRateLimitError(error) || attempt === retries - 1) {
        throw error;
      }

      const delayMs = 1200 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

function toSafeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function cleanSnippet(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFallbackReport(
  query: string,
  sources: Array<{ title: string; url: string; content: string }>,
  reason?: string
): string {
  const sourceRows = sources.slice(0, 8);
  const readableBullets = sourceRows.length
    ? sourceRows
        .map((source) => {
          const summary = cleanSnippet(source.content).slice(0, 120) || "Relevant information was captured from this source.";
          return `- ${toSafeCell(source.title || "Untitled source")}: ${summary}`;
        })
        .join("\n")
    : "- No readable sources were available at generation time.";

  const quickComparison = sourceRows.length
    ? sourceRows
        .slice(0, 5)
        .map((source) => `| ${toSafeCell(source.title || "Untitled source")} | Mentioned in web sources |`)
        .join("\n")
    : "| No sources available | Insufficient evidence |";

  const safeReason =
    reason && isRateLimitError({ message: reason })
      ? "Temporary model capacity limits were hit during this request."
      : "Primary summarization was unavailable for this request.";

  return [
    "# Research Report",
    "",
    `Query: ${query}`,
    "",
    "## Key Insights",
    `- The workflow completed successfully and collected ${sources.length} source(s).`,
    "- A resilient summary mode was used to keep results available and readable.",
    `- Fallback reason: ${safeReason}`,
    "",
    "## Comparison",
    "Top compared options and evidence summary:",
    "",
    readableBullets,
    "",
    "Quick comparison table:",
    "| Option | Relative Presence |",
    "| --- | --- |",
    quickComparison,
    "",
    "## Conclusion",
    "The report is readable and complete, based on available sources, and can be regenerated with richer detail when model capacity is available.",
  ].join("\n");
}

async function extractToolData(content: string, query: string): Promise<ToolData[]> {
  const cleanedContent = cleanSnippet(content).slice(0, 4500);

  const response = await withRateLimitRetry(async () => {
    return groqClient.chat.completions.create(
      {
        model: "llama-3.1-8b-instant",
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content: [
              "Extract the primary products, tools, vendors, or options directly relevant to the user query.",
              `User query: ${query}`,
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
              "* Include only options relevant to the query domain",
              "* Ignore irrelevant options",
              "* If pricing is unknown, set pricing to Unknown",
              "* No explanation text",
              "* No markdown",
              "* Return JSON only",
            ].join("\n"),
          },
          {
            role: "user",
            content: cleanedContent,
          },
        ],
      },
      {
        timeout: groqTimeoutMs,
      }
    );
  });

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

async function generateReportFromTools(tools: ToolData[], query: string): Promise<string> {
  const response = await withRateLimitRetry(async () => {
    return groqClient.chat.completions.create(
      {
        model: "llama-3.1-8b-instant",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: [
              "Generate a professional report using this JSON data:",
              `User query: ${query}`,
              JSON.stringify(tools),
              "",
              "Requirements:",
              "* Minimum 700 words",
              "* MUST include pricing",
              "* MUST include pros and cons for each option",
              "* MUST include a concise comparison table",
              "* No repetition",
              "* Keep language concise and human readable",
              "* Keep each table cell short",
              "",
              "Structure:",
              "1. Title",
              "2. Key Insights",
              "3. Comparison",
              "4. Detailed Breakdown",
              "5. Best Options by Use Case",
              "6. Conclusion",
            ].join("\n"),
          },
        ],
      },
      {
        timeout: groqTimeoutMs,
      }
    );
  });

  const content = response.choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}

async function regenerateReport(tools: ToolData[], query: string): Promise<string> {
  const response = await withRateLimitRetry(async () => {
    return groqClient.chat.completions.create(
      {
        model: "llama-3.1-8b-instant",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: [
              "Regenerate the report from this JSON and strictly satisfy all constraints.",
              `User query: ${query}`,
              JSON.stringify(tools),
              "",
              "Hard constraints:",
              "* Minimum 700 words",
              "* Include clear Pricing sections",
              "* Include explicit Pros and Cons for every option",
              "* Include a concise markdown comparison table using pipe characters",
              "* Remove generic statements, repetition, and raw HTML fragments",
              "* Keep output easy for non-technical readers",
              "",
              "Structure:",
              "1. Title",
              "2. Key Insights",
              "3. Comparison Table",
              "4. Detailed Breakdown",
              "5. Best Options by Use Case",
              "6. Conclusion",
            ].join("\n"),
          },
        ],
      },
      {
        timeout: groqTimeoutMs,
      }
    );
  });

  const content = response.choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}

async function updateJobStage(jobId: string, currentStage: string, status?: Status): Promise<void> {
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

const MAX_SOURCES = 5;
const SUMMARIZER_SOURCE_TOKEN_BUDGET = 1000;
const SUMMARIZER_MAX_OUTPUT_TOKENS = 1500;
const CRITIC_INPUT_TOKEN_BUDGET = 1000;

type SummarizerSource = {
  title: string;
  url: string;
  content: string;
};

function buildCombinedSourcesInput(query: string, sources: SummarizerSource[]): string {
  const combined = sources
    .slice(0, MAX_SOURCES)
    .map((source, index) => {
      const trimmedContent = (source.content || "").slice(0, SUMMARIZER_SOURCE_TOKEN_BUDGET);
      return [
        `Source ${index + 1} Title: ${source.title || "Untitled"}`,
        `Source ${index + 1} URL: ${source.url || "Unknown"}`,
        `Source ${index + 1} Content: ${trimmedContent}`,
      ].join("\n");
    })
    .join("\n\n");

  return [
    `User Query: ${query}`,
    "",
    "Source Excerpts:",
    combined,
  ].join("\n");
}

async function callStructuredSummarizerLLM(input: string): Promise<string> {
  const prompt = buildSummarizerPrompt(input);

  const response = await groqClient.chat.completions.create(
    {
      model: "llama-3.1-8b-instant",
      temperature: 0.2,
      max_tokens: SUMMARIZER_MAX_OUTPUT_TOKENS,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    },
    {
      timeout: groqTimeoutMs,
    }
  );

  const output = response.choices?.[0]?.message?.content;

  if (typeof output !== "string" || output.trim().length === 0) {
    throw new Error("Summarizer returned empty output");
  }

  return output.trim();
}

const worker = new Worker<{ jobId: string; query: string }>(
  "research-queue",
  async (job) => {
    const jobStart = Date.now();
    const { jobId, query } = job.data ?? {};

    let plannerMs = 0;
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
      const existingJob = await prisma.researchJob.findUnique({
        where: { id: jobId },
        select: { id: true },
      });

      if (existingJob) {
        await prisma.researchJob.update({
          where: { id: jobId },
          data: {
            query,
            status: "running",
            currentStage: "planning",
          },
        });
      } else {
        await prisma.researchJob.create({
          data: {
            id: jobId,
            query,
            status: "running",
            currentStage: "planning",
          },
        });
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

      plannerMs = Date.now() - plannerStart;

      logger.info({
        jobId,
        stage: "planner_completed",
        taskCount: plannedTasks.length,
        planner_ms: plannerMs,
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

      const validSources = sources.filter((source) => source.content.trim().length > 0);
      const selectedSources = pickRelevantSources(query, validSources, MAX_SOURCES);

      logger.info({
        jobId,
        stage: "summarizer_started",
        sources_used: selectedSources.length,
      });

      let report: StructuredReport;

      try {
        const combined = buildCombinedSourcesInput(query, selectedSources);
        const llmText = await withRateLimitRetry(() => callStructuredSummarizerLLM(combined));
        report = parseStructuredReport(llmText);
      } catch (error) {
        logger.error({
          jobId,
          stage: "summarizer_parse_failed",
          error: getErrorMessage(error),
        });
        report = buildStructuredFallbackReport(query, selectedSources);
      }

      if ((report.keyInsights?.length ?? 0) < 3) {
        await updateJobStage(jobId, "critic");

        try {
          const criticInput = truncateToTokenLimit(JSON.stringify(report), CRITIC_INPUT_TOKEN_BUDGET);
          const criticResult = await criticAgent(criticInput);

          if (criticResult.improvedReport) {
            report = parseStructuredReport(criticResult.improvedReport);
          }
        } catch (error) {
          logger.error({
            jobId,
            stage: "critic_reparse_failed",
            error: getErrorMessage(error),
          });
        }
      }

      summarizeMs = Date.now() - summarizeStart;

      logger.info({
        jobId,
        stage: "summarizer_completed",
        insights: report.keyInsights.length,
      });

      logger.info({ jobId, stage: "report_persist_start" });

      await prisma.researchReport.upsert({
        where: { jobId },
        update: {
          content: JSON.stringify(report),
        },
        create: {
          content: JSON.stringify(report),
          jobId,
        },
      });

      logger.info({ jobId, stage: "report_persist_done" });
      await prisma.researchJob.update({
        where: { id: jobId },
        data: {
          status: "completed",
          currentStage: "completed",
          plannerMs,
          researchMs,
          scrapeMs,
          summarizeMs,
          completedAt: new Date(),
          errorMessage: null,
        },
      });

      logger.info({ jobId, stage: "job_completed" });
    } catch (error) {
      const errorMessage = getErrorMessage(error);

      logger.error({
        jobId,
        stage: "job_failed",
        error: errorMessage,
      });

      try {
        await prisma.researchJob.update({
          where: { id: jobId },
          data: {
            status: "failed",
            currentStage: "failed",
            plannerMs,
            researchMs,
            scrapeMs,
            summarizeMs,
            completedAt: new Date(),
            errorMessage,
          },
        });
      } catch (updateError) {
        logger.error({
          jobId,
          stage: "job_status_update_failed",
          error: getErrorMessage(updateError),
        });
      }

      throw error instanceof Error ? error : new Error(errorMessage);
    } finally {
      const totalJobMs = Date.now() - jobStart;

      logger.info({
        jobId,
        stage: "timing",
        planner_ms: plannerMs,
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
    autorun: false,
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

async function startWorker(): Promise<void> {
  try {
    await ensureDatabaseReady({
      runMigrations: env.runMigrationsOnBoot,
    });
    void worker.run();

    logger.info({
      jobId: null,
      stage: "worker_booted",
    });
  } catch (error) {
    console.error("worker_bootstrap_failed: " + getErrorMessage(error));
    process.exit(1);
  }
}

async function shutdownWorker(): Promise<void> {
  await worker.close().catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(0);
}

process.once("SIGINT", () => {
  void shutdownWorker();
});

process.once("SIGTERM", () => {
  void shutdownWorker();
});

void startWorker();
