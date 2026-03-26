import { scraperAgent } from "./scraper.agent";
import { playwrightScraperAgent } from "./playwrightScraper.agent";
import { logger } from "../lib/logger";

export type SmartScrapeResult = {
  content: string;
  method: "fast" | "playwright";
};

function shouldUsePlaywright(content: string): boolean {
  const normalized = content.toLowerCase();

  if (normalized.length < 500) {
    return true;
  }

  return (
    normalized.includes("enable javascript") ||
    normalized.includes("access denied") ||
    normalized.includes("captcha") ||
    normalized.includes("cloudflare")
  );
}

export async function smartScraperAgent(url: string): Promise<SmartScrapeResult> {
  if (url.includes("medium.com") || url.includes("linkedin.com")) {
    logger.info({
      stage: "smart_scraper_force_playwright",
      url,
    });

    const content = await playwrightScraperAgent(url, { timeoutMs: 5_000 });

    if (content.trim().length > 0) {
      return {
        content,
        method: "playwright",
      };
    }

    const fastFallback = await scraperAgent(url);
    return {
      content: fastFallback,
      method: "fast",
    };
  }

  const fastContent = await scraperAgent(url);

  if (!shouldUsePlaywright(fastContent)) {
    return {
      content: fastContent,
      method: "fast",
    };
  }

  logger.info({
    stage: "smart_scraper_fallback_playwright",
    url,
  });

  const dynamicContent = await playwrightScraperAgent(url, { timeoutMs: 5_000 });

  if (dynamicContent.trim().length > 0) {
    return {
      content: dynamicContent,
      method: "playwright",
    };
  }

  return {
    content: fastContent,
    method: "fast",
  };
}
