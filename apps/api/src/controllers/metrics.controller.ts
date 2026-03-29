import { Request, Response } from "express";
import { getMetrics } from "../services/metrics.service";

export async function metricsController(_req: Request, res: Response): Promise<void> {
  try {
    const data = await getMetrics();
    res.status(200).json(data);
  } catch {
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
}