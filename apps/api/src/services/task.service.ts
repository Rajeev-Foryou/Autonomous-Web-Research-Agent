import { randomUUID } from "crypto";
import { prisma } from "../db/prisma";

type ResearchTaskRow = {
  id: string;
  title: string;
  status: string;
  result: string | null;
  jobId: string;
};

export async function createTasks(jobId: string, tasks: string[]) {
  if (!tasks.length) {
    throw new Error("Tasks list cannot be empty");
  }

  const createdTasksByInsert = await prisma.$transaction(
    tasks.map((title) => {
      const id = randomUUID();

      return (
      prisma.$queryRaw<ResearchTaskRow[]>`
        INSERT INTO "ResearchTask" ("id", "title", "status", "jobId")
        VALUES (${id}, ${title}, 'pending', ${jobId})
        RETURNING "id", "title", "status", "result", "jobId"
      `
      );
    })
  );

  return createdTasksByInsert.flat();
}
