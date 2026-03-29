import { Router } from "express";
import { getHealth } from "../controllers/health.controller";
import { metricsController } from "../controllers/metrics.controller";

const healthRouter = Router();

healthRouter.get("/", getHealth);
healthRouter.get("/health", getHealth);
healthRouter.get("/metrics", metricsController);

export default healthRouter;
