import { exec } from "child_process";
import path from "path";
import { prisma } from "../lib/prisma";

let readyPromise: Promise<typeof prisma> | null = null;

function runPrismaMigrateDeploy(): Promise<void> {
  const schemaPath = path.resolve(__dirname, "../../prisma/schema.prisma");
  const command = `npx prisma migrate deploy --schema "${schemaPath}"`;

  return new Promise((resolve, reject) => {
    exec(command, {
      cwd: path.resolve(__dirname, "../.."),
      env: process.env,
    }, (error, _stdout, stderr) => {
      if (!error) {
        resolve();
        return;
      }

      reject(new Error("prisma migrate deploy failed" + (stderr ? ": " + stderr.trim() : "")));
    });
  });
}

type EnsureDatabaseReadyOptions = {
  runMigrations?: boolean;
};

export async function ensureDatabaseReady(options: EnsureDatabaseReadyOptions = {}): Promise<typeof prisma> {
  const shouldRunMigrations = options.runMigrations ?? true;

  if (!readyPromise) {
    readyPromise = (async () => {
      if (shouldRunMigrations) {
        await runPrismaMigrateDeploy();
      }

      await prisma.$connect();
      await prisma.$executeRawUnsafe("SELECT 1");
      return prisma;
    })().catch((error) => {
      readyPromise = null;
      throw error;
    });
  }

  return readyPromise;
}

export { prisma };