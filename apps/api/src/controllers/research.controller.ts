import { Request, Response } from "express";
import { prisma } from "../db/prisma";
import { researchQueue } from "../queue/research.queue";
import { createTasks } from "../services/task.service";

function mockPlanner(query: string): string[] {
  return [
    `Search overview of ${query}`,
    `Find top tools for ${query}`,
    `Compare features of ${query}`,
    `Check pricing of ${query}`,
  ];
}

export const createResearchJob = async (req: Request, res: Response) => {
  let createdJobId: string | null = null;

  try {
    const rawQuery = req.body?.query;
    const query = typeof rawQuery === "string" ? rawQuery.trim() : "";

    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }

    const plannedTasks = mockPlanner(query);

    if (!plannedTasks.length) {
      console.error("Planner returned no tasks for query", { query });
      return res.status(500).json({ error: "Task planner returned no tasks" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const job = await tx.researchJob.create({
        data: {
          query,
          status: "pending",
        },
      });

      const createdTasks = await createTasks(tx, job.id, plannedTasks);

      return {
        job,
        createdTasks,
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
