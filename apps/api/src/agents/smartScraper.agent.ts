import { scraperAgent } from "./scraper.agent";
import { playwrightScraperAgent } from "./playwrightScraper.agent";
import { logger } from "../lib/logger";

export async function smartScraperAgent(url: string): Promise<string> {
  if (url.includes("medium.com") || url.includes("linkedin.com")) {
    logger.info({
      stage: "smart_scraper_force_playwright",
      url,
    });
    return await playwrightScraperAgent(url);
  }

  const fastContent = await scraperAgent(url);

  if (fastContent.length > 2000) {
    return fastContent;
  }

  logger.info({
    stage: "smart_scraper_fallback_playwright",
    url,
  });

  const dynamicContent = await playwrightScraperAgent(url);
  return dynamicContent;
}
