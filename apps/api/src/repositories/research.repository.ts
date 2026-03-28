import { prisma } from "../lib/prisma";
import { Prisma } from "@prisma/client";
import { Status } from "../types/status";

export type FullJobRecord = Awaited<ReturnType<typeof prisma.researchJob.findUnique>>;
export type StatusJobRecord = Awaited<ReturnType<typeof prisma.researchJob.findUnique>>;

type CreateJobInput = {
  id: string;
  query: string;
  idempotencyKey: string | null;
};

function isMissingColumnError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022";
}

export async function findResearchJobById(jobId: string) {
  return prisma.researchJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      currentStage: true,
      createdAt: true,
      completedAt: true,
      plannerMs: true,
      researchMs: true,
      scrapeMs: true,
      summarizeMs: true,
      errorMessage: true,
      report: {
        select: {
          content: true,
        },
      },
      sources: {
        select: {
          title: true,
          url: true,
        },
      },
    },
  });
}

export async function findResearchJobStatusById(jobId: string) {
  return prisma.researchJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      currentStage: true,
    },
  });
}

export async function findResearchJobByIdempotencyKey(idempotencyKey: string | null) {
  if (!idempotencyKey) {
    return null;
  }

  try {
    return prisma.researchJob.findUnique({
      where: {
        idempotencyKey,
      },
      select: {
        id: true,
        status: true,
        currentStage: true,
      },
    });
  } catch (error) {
    if (isMissingColumnError(error)) {
      return null;
    }

    throw error;
  }
}

export async function createResearchJob(input: CreateJobInput) {
  const baseData = {
    id: input.id,
    query: input.query,
    status: "pending" as Status,
    currentStage: "planning",
  };

  const dataWithIdempotency = input.idempotencyKey
    ? {
        ...baseData,
        idempotencyKey: input.idempotencyKey,
      }
    : baseData;

  try {
    return prisma.researchJob.create({
      data: dataWithIdempotency,
      select: {
        id: true,
        status: true,
        currentStage: true,
      },
    });
  } catch (error) {
    if (input.idempotencyKey && isMissingColumnError(error)) {
      return prisma.researchJob.create({
        data: baseData,
        select: {
          id: true,
          status: true,
          currentStage: true,
        },
      });
    }

    throw error;
  }
}
