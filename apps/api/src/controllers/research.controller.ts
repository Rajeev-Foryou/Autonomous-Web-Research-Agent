import { Request, Response } from "express";
import { prisma } from "../db/prisma";
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
  try {
    const rawQuery = req.body?.query;
    const query = typeof rawQuery === "string" ? rawQuery.trim() : "";

    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }

    const job = await prisma.researchJob.create({
      data: {
        query,
        status: "pending",
      },
    });

    const plannedTasks = mockPlanner(query);

    if (!plannedTasks.length) {
      console.error("Planner returned no tasks for query", { query, jobId: job.id });
      return res.status(500).json({ error: "Task planner returned no tasks" });
    }

    const createdTasks = await createTasks(job.id, plannedTasks);

    return res.status(201).json({
      id: job.id,
      status: job.status,
      tasks: createdTasks,
    });
  } catch (error) {
    console.error("Failed to create research job", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
