const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type ApiError = {
  error?: string;
  code?: string;
};

export interface CreateResearchResponse {
  jobId: string;
  status: "pending" | "running" | "completed" | "failed";
  currentStage: "planning" | "research" | "scraping" | "summarizing" | "failed" | "completed";
  progress: number;
}

export interface ResearchStatus {
  jobId: string;
  status: "pending" | "running" | "completed" | "failed";
  currentStage: "planning" | "research" | "scraping" | "summarizing" | "failed" | "completed";
  progress: number;
}

export interface ResearchResult {
  report: {
    title: string;
    keyInsights: string[];
    comparison: string;
    conclusion: string;
  };
  sources: { title: string; url: string }[];
}

async function parseApiError(response: Response, fallback: string): Promise<never> {
  const errorPayload = (await response.json().catch(() => ({}))) as ApiError;
  throw new Error(errorPayload.error || fallback);
}

export async function createResearch(query: string): Promise<CreateResearchResponse> {
  const response = await fetch(`${API_BASE_URL}/research`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    return parseApiError(response, "Failed to create research task");
  }

  return response.json();
}

export async function getStatus(jobId: string): Promise<ResearchStatus> {
  const response = await fetch(`${API_BASE_URL}/research/${jobId}/status`);

  if (!response.ok) {
    return parseApiError(response, `Failed to fetch status for job ${jobId}`);
  }

  return response.json();
}

export async function getResult(jobId: string): Promise<ResearchResult> {
  const response = await fetch(`${API_BASE_URL}/research/${jobId}`);

  if (!response.ok) {
    return parseApiError(response, `Failed to fetch results for job ${jobId}`);
  }

  return response.json();
}
