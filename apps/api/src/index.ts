import cors from "cors";
import express from "express";
import healthRouter from "./routes/health.routes";
import researchRoutes from "./routes/research.routes";
import { env } from "./config/env";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/", healthRouter);
app.use("/research", researchRoutes);

app.listen(env.port, () => {
  // Keep startup logs structured for container and cloud runtimes.
  console.log("API listening on port " + env.port + " (" + env.nodeEnv + ")");
});
