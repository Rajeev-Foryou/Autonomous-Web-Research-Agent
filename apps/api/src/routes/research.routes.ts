import { Router } from "express";
import { createResearchJob } from "../controllers/research.controller";

const router = Router();

router.post("/", createResearchJob);

export default router;