import dotenv from "dotenv";

dotenv.config();

function parseBoolean(rawValue: string | undefined, defaultValue: boolean): boolean {
  if (rawValue === undefined) {
    return defaultValue;
  }

  const normalized = rawValue.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error("Boolean env value is invalid: " + rawValue);
}

function parsePort(rawValue: string | undefined): number {
  const parsed = Number(rawValue ?? "4000");

  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error("PORT must be a valid TCP port number");
  }

  return parsed;
}

function parsePositiveInteger(
  rawValue: string | undefined,
  defaultValue: number,
  variableName: string
): number {
  if (rawValue === undefined) {
    return defaultValue;
  }

  const parsed = Number(rawValue);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(variableName + " must be a positive integer");
  }

  return parsed;
}

function parseCorsAllowedOrigins(rawValue: string | undefined): string[] {
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

const redisUrl = process.env.REDIS_URL?.trim();

if (!redisUrl) {
  throw new Error("REDIS_URL is required");
}

const nodeEnv = process.env.NODE_ENV?.trim() || "development";
const isProduction = nodeEnv === "production";
const corsAllowedOrigins = parseCorsAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);

if (isProduction && corsAllowedOrigins.length === 0) {
  throw new Error("CORS_ALLOWED_ORIGINS is required in production");
}

export const env = {
  nodeEnv,
  isProduction,
  port: parsePort(process.env.PORT),
  redisUrl,
  corsAllowedOrigins,
  runMigrationsOnBoot: parseBoolean(process.env.RUN_MIGRATIONS_ON_BOOT, true),
  rateLimitEnabled: parseBoolean(process.env.RATE_LIMIT_ENABLED, true),
  rateLimitWindowMs: parsePositiveInteger(process.env.RATE_LIMIT_WINDOW_MS, 60000, "RATE_LIMIT_WINDOW_MS"),
  rateLimitMaxRequests: parsePositiveInteger(process.env.RATE_LIMIT_MAX_REQUESTS, 60, "RATE_LIMIT_MAX_REQUESTS"),
};
