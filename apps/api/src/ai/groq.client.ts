import OpenAI from "openai";

const groqApiKey = process.env.GROQ_API_KEY;
const groqTimeoutRaw = process.env.GROQ_TIMEOUT_MS;
const parsedGroqTimeoutMs = Number(groqTimeoutRaw ?? "15000");

if (!Number.isFinite(parsedGroqTimeoutMs) || parsedGroqTimeoutMs <= 0) {
  throw new Error("GROQ_TIMEOUT_MS must be a positive number when provided");
}

if (!groqApiKey) {
  throw new Error("GROQ_API_KEY is required to initialize Groq client");
}

export const groqTimeoutMs = parsedGroqTimeoutMs;

export const groqClient = new OpenAI({
  apiKey: groqApiKey,
  baseURL: "https://api.groq.com/openai/v1",
  timeout: groqTimeoutMs,
});
