import fs from "fs";
import pino from "pino";

if (!fs.existsSync("./logs")) {
  fs.mkdirSync("./logs", { recursive: true });
}

export const logger = pino(
  {
    level: "info",
  },
  pino.destination("./logs/worker.log")
);
