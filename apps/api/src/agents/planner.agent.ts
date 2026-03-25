import { groqClient, groqTimeoutMs } from "../ai/groq.client";
import { plannerPrompt } from "../ai/prompts/planner.prompt";
import { logger } from "../lib/logger";

export function fallbackTasks(query: string): string[] {
  const subject = query.trim() || "the topic";

  return [
    `Search overview of ${subject}`,
    `Find tools and platforms for ${subject}`,
    `Compare leading options for ${subject}`,
    `Analyze pricing and plans for ${subject}`,
  ];
}

function sanitizeTasks(tasks: unknown): string[] {
  if (!Array.isArray(tasks)) {
    return [];
  }

  const seen = new Set<string>();
  const normalizedTasks: string[] = [];

  for (const item of tasks) {
    if (typeof item !== "string") {
      continue;
    }

    const task = item.trim();

    if (!task) {
      continue;
    }

    const key = task.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalizedTasks.push(task);

    if (normalizedTasks.length === 6) {
      break;
    }
  }

  return normalizedTasks;
}

export async function plannerAgent(query: string): Promise<string[]> {
  const subject = query.trim();

  if (!subject) {
    return fallbackTasks(query);
  }

  try {
    const response = await groqClient.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: plannerPrompt,
        },
        {
          role: "user",
          content: subject,
        },
      ],
    }, {
      timeout: groqTimeoutMs,
    });

    const content = response.choices?.[0]?.message?.content;
    const rawText = typeof content === "string" ? content.trim() : "";

    if (!rawText) {
      logger.info({
        stage: "planner_empty_response",
        query: subject,
      });
      return fallbackTasks(subject);
    }

    try {
      const parsed = JSON.parse(rawText);
      const tasks = sanitizeTasks(parsed);

      if (tasks.length >= 4) {
        return tasks;
      }

      logger.info({
        stage: "planner_too_few_tasks",
        query: subject,
        parsedLength: tasks.length,
      });
      return fallbackTasks(subject);
    } catch (parseError) {
      logger.info({
        stage: "planner_invalid_json",
        query: subject,
        response: rawText,
        parseError,
      });
      return fallbackTasks(subject);
    }
  } catch (error) {
    logger.error({
      stage: "planner_request_failed",
      query: subject,
      error,
    });
    return fallbackTasks(subject);
  }
}
