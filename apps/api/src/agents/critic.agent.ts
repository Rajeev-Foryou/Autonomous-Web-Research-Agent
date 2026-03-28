import { groqClient, groqTimeoutMs } from "../ai/groq.client";
import { criticPrompt } from "../ai/prompts/critic.prompt";
import { logger } from "../lib/logger";
import { truncateToTokenLimit } from "../utils/token.util";

const CRITIC_TOKEN_BUDGET = 1000;

type CriticResult = {
  score: number;
  issues: string[];
  improvedReport: string | null;
};

const criticFallback: CriticResult = {
  score: 8,
  issues: [],
  improvedReport: null,
};

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim();
  }

  return trimmed;
}

function toCriticResult(value: unknown): CriticResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    score?: unknown;
    issues?: unknown;
    improvedReport?: unknown;
  };

  if (typeof candidate.score !== "number" || !Number.isFinite(candidate.score)) {
    return null;
  }

  const clampedScore = Math.max(1, Math.min(10, Math.round(candidate.score)));

  const issues = Array.isArray(candidate.issues)
    ? candidate.issues
      .filter((issue): issue is string => typeof issue === "string")
      .map((issue) => issue.trim())
      .filter(Boolean)
    : [];

  const improvedReport = typeof candidate.improvedReport === "string"
    ? candidate.improvedReport.trim() || null
    : null;

  // Enforce deterministic policy: never return improved text when score is already good.
  if (clampedScore >= 8) {
    return {
      score: clampedScore,
      issues,
      improvedReport: null,
    };
  }

  return {
    score: clampedScore,
    issues,
    improvedReport,
  };
}

export async function criticAgent(report: string): Promise<{
  score: number;
  issues: string[];
  improvedReport: string | null;
}> {
  const normalizedReport = truncateToTokenLimit(report.trim(), CRITIC_TOKEN_BUDGET);

  if (!normalizedReport) {
    return criticFallback;
  }

  try {
    const response = await groqClient.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: criticPrompt,
        },
        {
          role: "user",
          content: normalizedReport,
        },
      ],
    }, {
      timeout: groqTimeoutMs,
    });

    const content = response.choices?.[0]?.message?.content;
    const rawText = typeof content === "string" ? content.trim() : "";

    if (!rawText) {
      logger.info({
        stage: "critic_empty_response",
      });
      return criticFallback;
    }

    try {
      const parsed = JSON.parse(extractJsonObject(rawText));
      const safeResult = toCriticResult(parsed);

      if (!safeResult) {
        logger.info({
          stage: "critic_invalid_shape",
        });
        return criticFallback;
      }

      return safeResult;
    } catch (parseError) {
      logger.info({
        stage: "critic_invalid_json",
        parseError,
      });
      return criticFallback;
    }
  } catch (error) {
    logger.error({
      stage: "critic_failed",
      error,
    });
    return criticFallback;
  }
}