import { Request, Response } from "express";
import { logger } from "../lib/logger";
import {
  createResearchJobRequest,
  JobFailedError,
  getResearchDetails,
  getResearchStatus,
  NotFoundError,
  ReportNotReadyError,
} from "../services/research.service";

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value: string): boolean {
  return UUID_V4_REGEX.test(value);
}

function parseIdempotencyKey(req: Request): string | null {
  const headerValue = req.header("x-idempotency-key");

  if (!headerValue) {
    return null;
  }

  const normalized = headerValue.trim();

  if (!normalized) {
    return null;
  }

  return normalized;
}

function sendError(res: Response, status: number, error: string, code?: string) {
  return res.status(status).json({
    error,
    ...(code ? { code } : {}),
  });
}

export const createResearchJob = async (req: Request, res: Response) => {
  const startMs = Date.now();
  logger.info({ route: "POST /research", jobId: null, stage: "request_received" });

  try {
    const rawQuery = req.body?.query;
    const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
    const idempotencyKey = parseIdempotencyKey(req);

    if (!query) {
      logger.warn({ route: "POST /research", jobId: null, error: "Query is required" });
      return sendError(res, 400, "Query is required", "INVALID_QUERY");
    }

    if (idempotencyKey && idempotencyKey.length > 128) {
      logger.warn({ route: "POST /research", jobId: null, error: "x-idempotency-key too long" });
      return sendError(res, 400, "x-idempotency-key must be 128 characters or fewer", "INVALID_IDEMPOTENCY_KEY");
    }

    const result = await createResearchJobRequest({
      query,
      idempotencyKey,
    });

    logger.info({
      route: "POST /research",
      jobId: result.jobId,
      idempotencyKey: idempotencyKey ?? undefined,
      deduplicated: result.deduplicated,
      totalMs: Date.now() - startMs,
    });

    return res.status(result.deduplicated ? 200 : 202).json({
      jobId: result.jobId,
      status: result.status,
      currentStage: result.currentStage,
      progress: result.progress,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create research job";
    const stack = error instanceof Error ? error.stack : undefined;

    logger.error({
      route: "POST /research",
      jobId: null,
      error: message,
      stack,
      totalMs: Date.now() - startMs,
    });

    return sendError(res, 500, "Internal server error", "INTERNAL_ERROR");
  }
};

export const getResearchById = async (req: Request, res: Response) => {
  const startMs = Date.now();
  const jobId = typeof req.params.id === "string" ? req.params.id.trim() : "";

  logger.info({ route: "GET /research/:id", jobId: jobId || null, stage: "request_received" });

  if (!isValidUuid(jobId)) {
    logger.warn({ route: "GET /research/:id", jobId: jobId || null, error: "Invalid research job id" });
    return sendError(res, 400, "Invalid research job id", "INVALID_JOB_ID");
  }

  try {
    const response = await getResearchDetails(jobId);

    logger.info({
      route: "GET /research/:id",
      jobId,
      totalMs: Date.now() - startMs,
    });

    return res.status(200).json(response);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return sendError(res, 404, error.message, "NOT_FOUND");
    }

    if (error instanceof ReportNotReadyError) {
      return sendError(res, 409, error.message, "REPORT_NOT_READY");
    }

    if (error instanceof JobFailedError) {
      return sendError(res, 422, error.message, "JOB_FAILED");
    }

    const message = error instanceof Error ? error.message : "Failed to fetch research job";
    const stack = error instanceof Error ? error.stack : undefined;

    logger.error({
      route: "GET /research/:id",
      jobId,
      error: message,
      stack,
      totalMs: Date.now() - startMs,
    });

    return sendError(res, 500, "Internal server error", "INTERNAL_ERROR");
  }
};

export const getStatusById = async (req: Request, res: Response) => {
  const startMs = Date.now();
  const jobId = typeof req.params.id === "string" ? req.params.id.trim() : "";

  logger.info({ route: "GET /research/:id/status", jobId: jobId || null, stage: "request_received" });

  if (!isValidUuid(jobId)) {
    logger.warn({ route: "GET /research/:id/status", jobId: jobId || null, error: "Invalid research job id" });
    return sendError(res, 400, "Invalid research job id", "INVALID_JOB_ID");
  }

  try {
    const response = await getResearchStatus(jobId);

    logger.info({
      route: "GET /research/:id/status",
      jobId,
      totalMs: Date.now() - startMs,
    });

    return res.status(200).json(response);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return sendError(res, 404, error.message, "NOT_FOUND");
    }

    const message = error instanceof Error ? error.message : "Failed to fetch job status";
    const stack = error instanceof Error ? error.stack : undefined;

    logger.error({
      route: "GET /research/:id/status",
      jobId,
      error: message,
      stack,
      totalMs: Date.now() - startMs,
    });

    return sendError(res, 500, "Internal server error", "INTERNAL_ERROR");
  }
};
