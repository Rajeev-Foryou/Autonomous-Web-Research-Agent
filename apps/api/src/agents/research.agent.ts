import axios from "axios";
import { logger } from "../lib/logger";

export interface SearchResult {
  title: string;
  url: string;
  content: string;
}

type TavilyResult = {
  title?: unknown;
  url?: unknown;
  content?: unknown;
};

type TavilySearchResponse = {
  results?: TavilyResult[];
};

export async function researchAgent(query: string): Promise<SearchResult[]> {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return [];
  }

  const apiKey = process.env.TAVILY_API_KEY?.trim();

  if (!apiKey) {
    logger.error({
      stage: "research_missing_api_key",
      query: normalizedQuery,
    });
    return [];
  }

  try {
    const response = await axios.post<TavilySearchResponse>(
      "https://api.tavily.com/search",
      {
        api_key: apiKey,
        query: normalizedQuery,
        search_depth: "advanced",
        max_results: 3,
      },
      {
        timeout: 20_000,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const results = Array.isArray(response.data?.results) ? response.data.results : [];

    return results
      .map((item) => {
        const title = typeof item.title === "string" ? item.title.trim() : "";
        const url = typeof item.url === "string" ? item.url.trim() : "";
        const content = typeof item.content === "string" ? item.content.trim() : "";

        return {
          title,
          url,
          content,
        };
      })
      .filter((item) => item.title.length > 0 || item.url.length > 0 || item.content.length > 0);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({
        stage: "research_tavily_failed",
        query: normalizedQuery,
        status: error.response?.status,
        statusText: error.response?.statusText,
        responseBody: error.response?.data,
        message: error.message,
      });
    } else {
      logger.error({
        stage: "research_unexpected_error",
        query: normalizedQuery,
        error,
      });
    }

    return [];
  }
}