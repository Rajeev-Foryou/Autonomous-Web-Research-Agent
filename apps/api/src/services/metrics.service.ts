import { prisma } from "../lib/prisma";

const STUCK_JOB_MIN_AGE_MS = 30 * 60 * 1000;
const WINDOW_MS = 24 * 60 * 60 * 1000;

type JsonRecord = Record<string, unknown>;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function scoreReportContent(content: string): number {
  const trimmed = content.trim();

  if (!trimmed) {
    return 0;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return 0;
    }

    const data = parsed as JsonRecord;

    const titleScore = isNonEmptyString(data.title) ? 10 : 0;

    const keyInsights = toStringArray(data.keyInsights);
    const keyInsightsScore = Math.round((Math.min(keyInsights.length, 3) / 3) * 30);

    const comparisonTable = Array.isArray(data.comparisonTable) ? data.comparisonTable : [];
    const comparisonScore = Math.round((Math.min(comparisonTable.length, 3) / 3) * 25);

    const analysis = Array.isArray(data.analysis) ? data.analysis : [];
    const analysisScore = Math.round((Math.min(analysis.length, 2) / 2) * 15);

    const recommendationScore = isNonEmptyString(data.finalRecommendation) ? 10 : 0;
    const lengthScore = trimmed.length >= 900 ? 10 : Math.round((trimmed.length / 900) * 10);

    const total = titleScore + keyInsightsScore + comparisonScore + analysisScore + recommendationScore + lengthScore;
    return Math.max(0, Math.min(100, total));
  } catch {
    const normalized = trimmed.toLowerCase();
    const hasInsights = normalized.includes("key insight") || normalized.includes("insight");
    const hasComparison = normalized.includes("comparison");
    const hasConclusion = normalized.includes("conclusion") || normalized.includes("recommendation");

    const sectionScore = (hasInsights ? 20 : 0) + (hasComparison ? 20 : 0) + (hasConclusion ? 20 : 0);
    const lengthScore = Math.round(Math.min(trimmed.length / 1200, 1) * 40);

    return Math.max(0, Math.min(100, sectionScore + lengthScore));
  }
}

export type MetricsResponse = {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  successRate: number;
  avgCompletionTimeMs: number;
  reductionInStuckJobs: number;
  outputQualityScore: number;
};

export async function getMetrics(): Promise<MetricsResponse> {
  const now = Date.now();
  const nowDate = new Date(now);
  const stuckCutoff = new Date(now - STUCK_JOB_MIN_AGE_MS);
  const currentWindowStart = new Date(now - WINDOW_MS);
  const previousWindowStart = new Date(now - WINDOW_MS * 2);

  const [
    totalJobs,
    completedJobs,
    failedJobs,
    completedRecords,
    stuckCurrentWindow,
    stuckPreviousWindow,
    completedReports,
  ] = await Promise.all([
    prisma.researchJob.count(),
    prisma.researchJob.count({ where: { status: "completed" } }),
    prisma.researchJob.count({ where: { status: "failed" } }),
    prisma.researchJob.findMany({
      where: {
        status: "completed",
        completedAt: { not: null },
      },
      select: {
        createdAt: true,
        completedAt: true,
      },
    }),
    prisma.researchJob.count({
      where: {
        status: { in: ["pending", "running"] },
        completedAt: null,
        createdAt: {
          gte: currentWindowStart,
          lte: stuckCutoff,
        },
      },
    }),
    prisma.researchJob.count({
      where: {
        status: { in: ["pending", "running"] },
        completedAt: null,
        createdAt: {
          gte: previousWindowStart,
          lt: currentWindowStart,
          lte: stuckCutoff,
        },
      },
    }),
    prisma.researchReport.findMany({
      where: {
        job: {
          status: "completed",
          completedAt: {
            not: null,
            lte: nowDate,
          },
        },
      },
      select: {
        content: true,
      },
    }),
  ]);

  let avgCompletionTimeMs = 0;

  if (completedRecords.length > 0) {
    const totalTimeMs = completedRecords.reduce((acc, record) => {
      if (!record.completedAt) {
        return acc;
      }

      return acc + (record.completedAt.getTime() - record.createdAt.getTime());
    }, 0);

    avgCompletionTimeMs = Math.floor(totalTimeMs / completedRecords.length);
  }

  const successRate = totalJobs === 0 ? 0 : completedJobs / totalJobs;

  const reductionInStuckJobs =
    stuckPreviousWindow === 0
      ? 0
      : Number((((stuckPreviousWindow - stuckCurrentWindow) / stuckPreviousWindow) * 100).toFixed(2));

  const outputQualityScore =
    completedReports.length === 0
      ? 0
      : Math.round(
          completedReports.reduce((acc, report) => acc + scoreReportContent(report.content), 0) / completedReports.length
        );

  return {
    totalJobs,
    completedJobs,
    failedJobs,
    successRate,
    avgCompletionTimeMs,
    reductionInStuckJobs,
    outputQualityScore,
  };
}