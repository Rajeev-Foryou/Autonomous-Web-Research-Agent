import { Queue } from "bullmq";
import { redisConnection } from "./redis.connection";

export const researchQueue = new Queue("research-queue", {
  connection: redisConnection,
});