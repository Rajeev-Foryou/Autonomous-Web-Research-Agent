import { Request, Response } from "express";
import { v4 as uuid } from "uuid";
import { researchQueue } from "../queue/research.queue";

const logger = console;

export const createResearchJob = async (req: Request, res: Response) => {
  const start = Date.now();
  let queueMs = 0;

  try {
    const rawQuery = req.body?.query;
    const query = typeof rawQuery === "string" ? rawQuery.trim() : "";

    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }

    const jobId = uuid();

    const queueStart = Date.now();
    await researchQueue.add("research", {
      jobId,
      query,
    });
    queueMs = Date.now() - queueStart;

    const totalMs = Date.now() - start;

    logger.info({
      route: "/research",
      queueMs,
      totalMs,
    });

    return res.status(202).json({
      jobId,
      status: "pending",
    });
  } catch (error) {
    console.error("Failed to create research job", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
