import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

type ResearchTaskRow = {
  id: string;
  title: string;
  status: string;
  result: string | null;
  jobId: string;
};

export async function createTasks(db: Prisma.TransactionClient, jobId: string, tasks: string[]) {
  if (!tasks.length) {
    throw new Error("Tasks list cannot be empty");
  }

  const createdTasksByInsert = await Promise.all(
    tasks.map((title) => {
      const id = randomUUID();

      return db.$queryRaw<ResearchTaskRow[]>`
        INSERT INTO "ResearchTask" ("id", "title", "status", "jobId")
        VALUES (${id}, ${title}, 'pending', ${jobId})
        RETURNING "id", "title", "status", "result", "jobId"
      `;
    })
  );

  return createdTasksByInsert.flat();
}
