import { Request, Response } from "express";
import { prisma } from "../db/prisma";
import { researchQueue } from "../queue/research.queue";

export const createResearchJob = async (req: Request, res: Response) => {
  let createdJobId: string | null = null;

  try {
    const rawQuery = req.body?.query;
    const query = typeof rawQuery === "string" ? rawQuery.trim() : "";

    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const job = await tx.researchJob.create({
        data: {
          query,
          status: "pending",
        },
      });

      return {
        job,
      };
    });

    createdJobId = result.job.id;

    await researchQueue.add("research-job", {
      jobId: result.job.id,
    });

    return res.status(201).json({
      id: result.job.id,
      status: result.job.status,
    });
  } catch (error) {
    if (createdJobId) {
      try {
        await prisma.researchJob.update({
          where: { id: createdJobId },
          data: { status: "failed" },
        });
      } catch (updateError) {
        console.error("Failed to update job status after enqueue error", {
          createdJobId,
          updateError,
        });
      }
    }

    console.error("Failed to create research job", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
