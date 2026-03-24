import { scraperAgent } from "./scraper.agent";
import { playwrightScraperAgent } from "./playwrightScraper.agent";

export async function smartScraperAgent(url: string): Promise<string> {
  const fastContent = await scraperAgent(url);

  if (fastContent.length > 500) {
    return fastContent;
  }

  console.log("[smart-scraper-agent] fallback to playwright", { url });

  const dynamicContent = await playwrightScraperAgent(url);
  return dynamicContent;
}
