import { groqClient, groqTimeoutMs } from "../ai/groq.client";
import { summarizerFinalPrompt, summarizerSourcePrompt } from "../ai/prompts/summarizer.prompt";
import { logger } from "../lib/logger";

const summarizerFallback = [
  "Title:",
  "Summary unavailable",
  "",
  "Key Insights:",
  "* Unable to generate summary from the provided content.",
  "",
  "Comparison:",
  "Insufficient processed content to compare options.",
  "",
  "Conclusion:",
  "The report could not be generated at this time.",
].join("\n");

export async function summarizerAgent(content: string, mode: "source" | "final" = "source"): Promise<string> {
  const normalizedContent = content.trim();

  if (!normalizedContent) {
    return summarizerFallback;
  }

  try {
    const prompt = mode === "final" ? summarizerFinalPrompt : summarizerSourcePrompt;

    const response = await groqClient.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: prompt,
        },
        {
          role: "user",
          content: normalizedContent,
        },
      ],
    }, {
      timeout: groqTimeoutMs,
    });

    const output = response.choices?.[0]?.message?.content;
    const summary = typeof output === "string" ? output.trim() : "";

    if (!summary) {
      logger.info({
        stage: "summarizer_empty_response",
      });
      return summarizerFallback;
    }

    return summary;
  } catch (error) {
    logger.error({
      stage: "summarizer_failed",
      error,
    });
    return summarizerFallback;
  }
}