import type { StructuredReport } from "./parseStructuredReport";

export type Source = {
  title: string;
  url: string;
  content: string;
};

function safe(value: string | null | undefined, fallback: string): string {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized : fallback;
}

function domainFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host || "Unknown source";
  } catch {
    return "Unknown source";
  }
}

function shortText(content: string, limit = 140): string {
  return content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, limit) || "Relevant information was captured from this source.";
}

function pickRows(sources: Source[], count: number): Source[] {
  const sliced = sources.slice(0, count);

  if (sliced.length > 0) {
    return sliced;
  }

  return [
    {
      title: "Primary option",
      url: "https://example.com/option-1",
      content: "General option identified from available public information.",
    },
    {
      title: "Alternative option",
      url: "https://example.com/option-2",
      content: "Alternative option with different trade-offs.",
    },
    {
      title: "Value option",
      url: "https://example.com/option-3",
      content: "Value-focused option identified from source coverage.",
    },
  ];
}

export function buildFallbackReport(query: string, sources: Source[]): StructuredReport {
  const rows = pickRows(sources, 5);

  const tlDr = rows.slice(0, 3).map((source) => safe(source.title, "Recommended option"));

  const keyInsights = [
    "The report uses a deterministic fallback path to ensure complete output.",
    `A total of ${sources.length} source(s) were processed for this request.`,
    "Shortlisted options are derived from source titles and domains.",
    "Use the comparison and pros/cons to validate fit before final decision.",
  ].slice(0, 5);

  const comparisonTable = rows.slice(0, 5).map((source, index) => ({
    tool: safe(source.title, "Option " + (index + 1)),
    bestFor: index === 0 ? "Balanced overall fit" : index === 1 ? "Budget-conscious users" : "Feature-focused users",
    pricing: "Unknown",
    strength: "Mentioned across available web sources",
  }));

  const analysis = rows.slice(0, 5).map((source, index) => ({
    tool: safe(source.title, "Option " + (index + 1)),
    summary: shortText(source.content, 160),
  }));

  const pricingSummary = [
    "Pricing varies across providers and plans.",
    "Free and paid tiers are commonly available.",
    "Verify current pricing directly on vendor websites before purchase.",
  ].slice(0, 5);

  const prosCons = rows.slice(0, 5).map((source, index) => ({
    tool: safe(source.title, "Option " + (index + 1)),
    pros: [
      "Appears relevant to the requested topic.",
      "Has publicly available documentation or references.",
    ].slice(0, 5),
    cons: [
      "Detailed pricing may require direct vendor confirmation.",
      "Feature depth may differ by plan or region.",
    ].slice(0, 5),
  }));

  const domains = rows.slice(0, 3).map((source) => domainFromUrl(source.url));

  return {
    title: safe(query, "Research Report"),
    tlDr,
    keyInsights,
    comparisonTable,
    analysis,
    pricingSummary,
    prosCons,
    finalRecommendation:
      "Start with the top two options, validate pricing and feature fit against your priorities, then run a short pilot before full commitment. Sources reviewed include " +
      domains.join(", ") +
      ".",
  };
}
