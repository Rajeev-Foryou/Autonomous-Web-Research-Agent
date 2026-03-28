export type StructuredReport = {
  title: string;
  tlDr: string[];
  keyInsights: string[];
  comparisonTable: {
    tool: string;
    bestFor: string;
    pricing: string;
    strength: string;
  }[];
  analysis: {
    tool: string;
    summary: string;
  }[];
  pricingSummary: string[];
  prosCons: {
    tool: string;
    pros: string[];
    cons: string[];
  }[];
  finalRecommendation: string;
};

function normalizeString(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeStringList(value: unknown, fallbackPrefix: string, minCount: number, maxCount = 5): string[] {
  const list = Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0)
    : [];

  while (list.length < minCount) {
    list.push(fallbackPrefix + " " + (list.length + 1));
  }

  return list.slice(0, maxCount);
}

function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();

  if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
    const lines = trimmed.split(/\r?\n/);
    return lines.slice(1, -1).join("\n").trim();
  }

  return trimmed;
}

function ensureComparisonTable(value: unknown): StructuredReport["comparisonTable"] {
  const rows = Array.isArray(value) ? value : [];

  const normalized = rows
    .map((row, index) => {
      const candidate = typeof row === "object" && row !== null ? (row as Record<string, unknown>) : {};
      return {
        tool: normalizeString(candidate.tool, "Option " + (index + 1)),
        bestFor: normalizeString(candidate.bestFor, "General use"),
        pricing: normalizeString(candidate.pricing, "Unknown"),
        strength: normalizeString(candidate.strength, "Reliable baseline option"),
      };
    })
    .slice(0, 5);

  if (normalized.length > 0) {
    return normalized;
  }

  return [
    {
      tool: "Option 1",
      bestFor: "General use",
      pricing: "Unknown",
      strength: "Reliable baseline option",
    },
    {
      tool: "Option 2",
      bestFor: "Budget-first users",
      pricing: "Unknown",
      strength: "Cost-friendly entry point",
    },
    {
      tool: "Option 3",
      bestFor: "Feature-focused users",
      pricing: "Unknown",
      strength: "Balanced feature coverage",
    },
  ];
}

function ensureAnalysis(value: unknown): StructuredReport["analysis"] {
  const rows = Array.isArray(value) ? value : [];

  const normalized = rows
    .map((row, index) => {
      const candidate = typeof row === "object" && row !== null ? (row as Record<string, unknown>) : {};
      return {
        tool: normalizeString(candidate.tool, "Option " + (index + 1)),
        summary: normalizeString(candidate.summary, "Evidence indicates this option is relevant to the query."),
      };
    })
    .slice(0, 5);

  if (normalized.length > 0) {
    return normalized;
  }

  return [
    {
      tool: "Option 1",
      summary: "Evidence indicates this option is relevant to the query.",
    },
    {
      tool: "Option 2",
      summary: "This option appears suitable based on available source coverage.",
    },
    {
      tool: "Option 3",
      summary: "This option is a reasonable alternative depending on budget and priorities.",
    },
  ];
}

function ensureProsCons(value: unknown): StructuredReport["prosCons"] {
  const rows = Array.isArray(value) ? value : [];

  const normalized = rows
    .map((row, index) => {
      const candidate = typeof row === "object" && row !== null ? (row as Record<string, unknown>) : {};
      return {
        tool: normalizeString(candidate.tool, "Option " + (index + 1)),
        pros: normalizeStringList(candidate.pros, "Advantage", 1, 5),
        cons: normalizeStringList(candidate.cons, "Tradeoff", 1, 5),
      };
    })
    .slice(0, 5);

  if (normalized.length > 0) {
    return normalized;
  }

  return [
    {
      tool: "Option 1",
      pros: ["Good baseline quality"],
      cons: ["Limited detailed pricing transparency"],
    },
    {
      tool: "Option 2",
      pros: ["Easy to evaluate quickly"],
      cons: ["Feature depth may vary by plan"],
    },
    {
      tool: "Option 3",
      pros: ["Balanced overall fit"],
      cons: ["May require trade-offs on advanced features"],
    },
  ];
}

export function parseStructuredReport(raw: string): StructuredReport {
  const cleanRaw = stripCodeFences(raw);

  if (!cleanRaw) {
    throw new Error("Empty LLM response");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(cleanRaw);
  } catch (error) {
    throw new Error("Invalid JSON from summarizer: " + (error instanceof Error ? error.message : String(error)));
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Summarizer output is not a JSON object");
  }

  const data = parsed as Record<string, unknown>;

  return {
    title: normalizeString(data.title, "Research Report"),
    tlDr: normalizeStringList(data.tlDr, "Top pick", 3, 5),
    keyInsights: normalizeStringList(data.keyInsights, "Key insight", 3, 5),
    comparisonTable: ensureComparisonTable(data.comparisonTable),
    analysis: ensureAnalysis(data.analysis),
    pricingSummary: normalizeStringList(data.pricingSummary, "Pricing insight", 2, 5),
    prosCons: ensureProsCons(data.prosCons),
    finalRecommendation: normalizeString(data.finalRecommendation, "Choose the option with the best fit for your budget, required features, and implementation constraints."),
  };
}
