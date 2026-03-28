import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { prisma } from "../lib/prisma";
import { researchQueue } from "../queue/research.queue";
import {
  createResearchJob,
  findResearchJobById,
  findResearchJobByIdempotencyKey,
  findResearchJobStatusById,
} from "../repositories/research.repository";
import { ApiCurrentStage, ApiJobStatus, calculateProgress, mapCurrentStage, mapJobStatus } from "../utils/progress.util";
import { Status } from "../types/status";
import { parseStructuredReport, StructuredReport } from "../agents/utils/parseStructuredReport";

export type ResearchReportDto = {
  title: string;
  keyInsights: string[];
  comparison: string;
  conclusion: string;
};

export type SourceDto = {
  title: string;
  url: string;
};

export type ResearchDetailsResponse = {
  report: ResearchReportDto;
  sources: SourceDto[];
};

export type ResearchStatusResponse = {
  jobId: string;
  status: ApiJobStatus;
  currentStage: ApiCurrentStage;
  progress: number;
};

export type CreateResearchJobInput = {
  query: string;
  idempotencyKey: string | null;
};

export type CreateResearchJobResult = {
  jobId: string;
  status: ApiJobStatus;
  currentStage: ApiCurrentStage;
  progress: number;
  deduplicated: boolean;
};

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ReportNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportNotReadyError";
  }
}

export class JobFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobFailedError";
  }
}

function extractTitle(reportContent: string): string {
  const lines = reportContent.split(/\r?\n/).map((line) => line.trim());
  const heading = lines.find((line) => line.startsWith("# "));

  if (heading) {
    return heading.replace(/^#\s+/, "").trim();
  }

  return "Research Report";
}

function extractSummary(reportContent: string): string {
  const blocks = reportContent
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  const firstParagraph = blocks.find((block) => {
    if (block.startsWith("#")) {
      return false;
    }

    if (block.includes("|")) {
      return false;
    }

    return true;
  });

  if (!firstParagraph) {
    return "Summary is not available yet.";
  }

  return firstParagraph.slice(0, 800);
}

function extractSectionBody(reportContent: string, headings: string[]): string {
  const lines = reportContent.split(/\r?\n/);

  const startIndex = lines.findIndex((line) => {
    const normalized = line.trim().toLowerCase().replace(/:+$/, "");
    return headings.some((heading) => normalized.includes(heading));
  });

  if (startIndex < 0) {
    return "";
  }

  const sectionLines: string[] = [];

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trim();
    const normalized = line.toLowerCase().replace(/:+$/, "");

    const isNextHeading =
      /^#{1,6}\s/.test(line) ||
      /^\d+\.\s/.test(line) ||
      [
        "title",
        "key insights",
        "comparison",
        "comparison table",
        "detailed tool breakdown",
        "best tools by use case",
        "best tools by category",
        "conclusion",
      ].includes(normalized);

    if (isNextHeading && sectionLines.length > 0) {
      break;
    }

    if (line.length === 0 && sectionLines.length === 0) {
      continue;
    }

    sectionLines.push(rawLine);
  }

  return sectionLines.join("\n").trim();
}

function cleanReadableText(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function markdownTableToReadable(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));

  if (lines.length < 3) {
    return "";
  }

  const rows = lines
    .slice(2)
    .map((line) => line.split("|").map((cell) => cell.trim()).filter(Boolean))
    .filter((cells) => cells.length > 0)
    .slice(0, 6);

  if (rows.length === 0) {
    return "";
  }

  const bullets = rows.map((cells) => {
    const title = cleanReadableText(cells[0] ?? "Option").slice(0, 90);
    const detail = cleanReadableText(cells[1] ?? cells[2] ?? "Included in comparison").slice(0, 110);
    return "- " + title + ": " + (detail || "Included in comparison");
  });

  return ["Compared options:", ...bullets].join("\n");
}

function extractComparison(reportContent: string): string {
  const comparison = extractSectionBody(reportContent, ["comparison", "comparative analysis"]);

  if (comparison) {
    const readableTable = markdownTableToReadable(comparison);

    if (readableTable) {
      return readableTable;
    }

    const cleaned = cleanReadableText(comparison);
    return cleaned.slice(0, 1_200);
  }

  return extractSummary(reportContent);
}

function extractConclusion(reportContent: string): string {
  const conclusion = extractSectionBody(reportContent, ["conclusion", "strategic conclusion"]);

  if (conclusion) {
    return conclusion.slice(0, 1_200);
  }

  const paragraphs = reportContent
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (paragraphs[paragraphs.length - 1] ?? "Conclusion is not available yet.").slice(0, 1_200);
}

function extractInsights(reportContent: string): string[] {
  const lines = reportContent.split(/\r?\n/).map((line) => line.trim());

  const bulletInsights = lines
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 6);

  if (bulletInsights.length > 0) {
    return bulletInsights;
  }

  return ["Detailed insights are available in the full report body."];
}

function comparisonTableToText(report: StructuredReport): string {
  const header = "Tool | Best For | Pricing | Strength";
  const divider = "--- | --- | --- | ---";
  const rows = report.comparisonTable
    .slice(0, 5)
    .map((row) => {
      return [row.tool, row.bestFor, row.pricing, row.strength]
        .map((cell) => cell.replace(/\|/g, "\\|").trim() || "N/A")
        .join(" | ");
    });

  return [header, divider, ...rows].join("\n");
}

function toStructuredReportDto(content: string): ResearchReportDto | null {
  try {
    const structured = parseStructuredReport(content);
    return {
      title: structured.title,
      keyInsights: structured.keyInsights,
      comparison: comparisonTableToText(structured),
      conclusion: structured.finalRecommendation,
    };
  } catch {
    return null;
  }
}

function toReportDto(
  reportContent: string
): ResearchReportDto {
  const structured = toStructuredReportDto(reportContent);

  if (structured) {
    return structured;
  }

  return {
    title: extractTitle(reportContent),
    keyInsights: extractInsights(reportContent),
    comparison: extractComparison(reportContent),
    conclusion: extractConclusion(reportContent),
  };
}

function handlePotentialDuplicateCreateError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function ensureValidStatus(status: string): Status {
  const normalized = status.trim().toLowerCase();

  if (normalized === "running") {
    return "running";
  }

  if (normalized === "completed") {
    return "completed";
  }

  if (normalized === "failed") {
    return "failed";
  }

  return "pending";
}

export async function createResearchJobRequest(input: CreateResearchJobInput): Promise<CreateResearchJobResult> {
  if (input.idempotencyKey) {
    const existingJob = await findResearchJobByIdempotencyKey(input.idempotencyKey);

    if (existingJob) {
      const status = mapJobStatus(existingJob.status);
      const currentStage = mapCurrentStage(existingJob.currentStage);

      return {
        jobId: existingJob.id,
        status,
        currentStage,
        progress: calculateProgress(currentStage),
        deduplicated: true,
      };
    }
  }

  const jobId = randomUUID();
  let createdJob: { id: string; status: string; currentStage: string | null } | null = null;

  try {
    createdJob = await createResearchJob({
      id: jobId,
      query: input.query,
      idempotencyKey: input.idempotencyKey,
    });

    try {
      await researchQueue.add(
        "research",
        {
          jobId: createdJob.id,
          query: input.query,
        },
        {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 2000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        }
      );
    } catch (queueError) {
      if (createdJob?.id) {
        await prisma.researchJob.delete({
          where: {
            id: createdJob.id,
          },
        }).catch(() => undefined);
      }

      throw queueError;
    }

    const status = mapJobStatus(ensureValidStatus(createdJob.status));
    const currentStage = mapCurrentStage(createdJob.currentStage);

    return {
      jobId: createdJob.id,
      status,
      currentStage,
      progress: calculateProgress(currentStage),
      deduplicated: false,
    };
  } catch (error) {
    if (input.idempotencyKey && handlePotentialDuplicateCreateError(error)) {
      const existingJob = await findResearchJobByIdempotencyKey(input.idempotencyKey);

      if (existingJob) {
        const status = mapJobStatus(ensureValidStatus(existingJob.status));
        const currentStage = mapCurrentStage(existingJob.currentStage);

        return {
          jobId: existingJob.id,
          status,
          currentStage,
          progress: calculateProgress(currentStage),
          deduplicated: true,
        };
      }
    }

    throw error;
  }
}

export async function getResearchDetails(jobId: string): Promise<ResearchDetailsResponse> {
  const job = await findResearchJobById(jobId);

  if (!job) {
    throw new NotFoundError("Research job not found");
  }

  const status = mapJobStatus(ensureValidStatus(job.status));

  if (status === "failed") {
    throw new JobFailedError(job.errorMessage ?? "Research job failed");
  }

  if (status !== "completed" || !job.report?.content) {
    throw new ReportNotReadyError("Research report is not ready yet");
  }

  return {
    report: toReportDto(job.report.content),
    sources: job.sources,
  };
}

export async function getResearchStatus(jobId: string): Promise<ResearchStatusResponse> {
  const job = await findResearchJobStatusById(jobId);

  if (!job) {
    throw new NotFoundError("Research job not found");
  }

  const status = mapJobStatus(ensureValidStatus(job.status));
  const currentStage = mapCurrentStage(job.currentStage);

  return {
    jobId: job.id,
    status,
    currentStage,
    progress: calculateProgress(currentStage),
  };
}
