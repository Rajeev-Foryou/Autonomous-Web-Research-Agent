import { Router } from "express";
import { createResearchJob, getResearchById, getStatusById } from "../controllers/research.controller";

const router = Router();

router.post("/research", createResearchJob);
router.get("/research/:id", getResearchById);
router.get("/research/:id/status", getStatusById);

export default router;