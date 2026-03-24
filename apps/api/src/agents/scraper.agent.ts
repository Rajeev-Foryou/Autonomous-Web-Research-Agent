import axios from "axios";
import * as cheerio from "cheerio";

const MAX_CONTENT_LENGTH = 5_000;

export async function scraperAgent(url: string): Promise<string> {
  try {
    const normalizedUrl = url.trim();

    if (!normalizedUrl) {
      return "";
    }

    const response = await axios.get<string>(normalizedUrl, {
      timeout: 15_000,
      responseType: "text",
      headers: {
        "User-Agent": "Autonomous-Web-Research-Agent/1.0",
      },
      maxContentLength: 5 * 1024 * 1024,
    });

    const html = typeof response.data === "string" ? response.data : "";

    if (!html) {
      return "";
    }

    const $ = cheerio.load(html);

    $("script, style, nav, footer, header").remove();

    const bodyText = $("body").text() || "";
    const cleaned = bodyText.replace(/\s+/g, " ").trim();

    return cleaned.slice(0, MAX_CONTENT_LENGTH);
  } catch (error) {
    console.error("[scraper-agent] fast scraping failed", {
      url,
      error,
    });
    return "";
  }
}
