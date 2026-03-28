import { Queue, QueueEvents } from "bullmq";
import { redisConnection } from "./redis.connection";
import { logger } from "../lib/logger";

export const researchQueue = new Queue("research-queue", {
  connection: redisConnection,
});

export const researchQueueEvents = new QueueEvents("research-queue", {
  connection: redisConnection,
});

researchQueueEvents.on("completed", ({ jobId }) => {
  logger.info({ stage: "queue_event_completed", jobId });
});

researchQueueEvents.on("failed", ({ jobId, failedReason }) => {
  logger.error({ stage: "queue_event_failed", jobId, error: failedReason });
});

const shutdownQueue = async () => {
  await Promise.all([
    researchQueue.close().catch(() => undefined),
    researchQueueEvents.close().catch(() => undefined),
  ]);
};

process.once("SIGINT", () => {
  void shutdownQueue();
});

process.once("SIGTERM", () => {
  void shutdownQueue();
});