import { Status } from "../types/status";

const STAGE_PROGRESS: Record<string, number> = {
  planning: 10,
  research: 30,
  scraping: 60,
  summarizing: 85,
  failed: 100,
  completed: 100,
};

export type ApiJobStatus = Status;
export type ApiCurrentStage = "planning" | "research" | "scraping" | "summarizing" | "failed" | "completed";

export function mapJobStatus(rawStatus: string | null | undefined): ApiJobStatus {
  if (!rawStatus) {
    return "pending";
  }

  const normalized = rawStatus.trim().toLowerCase();

  if (normalized === "completed") {
    return "completed";
  }

  if (normalized === "failed") {
    return "failed";
  }

  if (normalized === "running") {
    return "running";
  }

  return "pending";
}

export function mapCurrentStage(rawStage: string | null | undefined): ApiCurrentStage {
  if (!rawStage) {
    return "planning";
  }

  const normalized = rawStage.trim().toLowerCase();

  if (normalized === "planning") {
    return "planning";
  }

  if (normalized === "research") {
    return "research";
  }

  if (normalized === "scraping") {
    return "scraping";
  }

  if (normalized === "summarizing") {
    return "summarizing";
  }

  if (normalized === "critic") {
    return "summarizing";
  }

  if (normalized === "completed") {
    return "completed";
  }

  if (normalized === "failed") {
    return "failed";
  }

  return "planning";
}

export function calculateProgress(stage: ApiCurrentStage): number {
  return STAGE_PROGRESS[stage] ?? 0;
}
