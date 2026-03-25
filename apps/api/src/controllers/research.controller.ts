import { Request, Response } from "express";
import { prisma } from "../db/prisma";
import { researchQueue } from "../queue/research.queue";

const logger = console;

export const createResearchJob = async (req: Request, res: Response) => {
  const start = Date.now();
  let dbMs = 0;
  let queueMs = 0;

  try {
    const rawQuery = req.body?.query;
    const query = typeof rawQuery === "string" ? rawQuery.trim() : "";

    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }

    const dbStart = Date.now();
    const jobPromise = prisma.researchJob.create({
      data: { query, status: "pending" },
      select: { id: true },
    });

    const queuePromise = jobPromise.then(async (job) => {
      const queueStart = Date.now();

      await researchQueue.add("research", {
        jobId: job.id,
        query,
      });

      queueMs = Date.now() - queueStart;
      return job;
    });

    const job = await jobPromise;
    dbMs = Date.now() - dbStart;

    await queuePromise;

    const totalMs = Date.now() - start;

    logger.info({
      route: "/research",
      dbMs,
      queueMs,
      totalMs,
    });

    return res.status(202).json({
      jobId: job.id,
      status: "pending",
    });
  } catch (error) {
    console.error("Failed to create research job", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
