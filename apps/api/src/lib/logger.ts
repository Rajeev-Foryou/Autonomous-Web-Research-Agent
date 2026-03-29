import fs from "fs";
import path from "path";
import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

if (!isProduction && !fs.existsSync("./logs")) {
  fs.mkdirSync("./logs", { recursive: true });
}

const destination = isProduction
  ? pino.destination(1)
  : pino.destination(path.resolve(process.cwd(), "logs/worker.log"));

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
  },
  destination
);
