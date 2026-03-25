import { chromium } from "playwright";
import { logger } from "../lib/logger";

const MAX_CONTENT_LENGTH = 5_000;

export async function playwrightScraperAgent(url: string): Promise<string> {
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    const normalizedUrl = url.trim();

    if (!normalizedUrl) {
      return "";
    }

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(normalizedUrl, {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });

    await page.evaluate(() => {
      const nodes = document.querySelectorAll("script, style, nav, footer, header");
      nodes.forEach((node) => node.remove());
    });

    const content = await page.evaluate(() => {
      return document.body?.innerText ?? "";
    });

    return content.replace(/\s+/g, " ").trim().slice(0, MAX_CONTENT_LENGTH);
  } catch (error) {
    logger.error({
      stage: "scraper_playwright_failed",
      url,
      error,
    });
    return "";
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        logger.error({
          stage: "scraper_playwright_close_failed",
          url,
          closeError,
        });
      }
    }
  }
}
