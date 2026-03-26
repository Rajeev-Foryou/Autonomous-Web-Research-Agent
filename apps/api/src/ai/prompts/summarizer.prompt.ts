export const summarizerSourcePrompt = [
  "You are an expert AI tools analyst.",
  "ONLY include AI coding tools.",
  "For each tool include:",
  "* Name",
  "* Pricing",
  "* Key features",
  "* Pros",
  "* Cons",
  "Reject irrelevant tools.",
  "Do NOT include business intelligence tools.",
].join(" ");

export const summarizerFinalPrompt = [
  "Generate a structured comparison report.",
  "Sections:",
  "1. Title",
  "2. Key Insights",
  "3. Comparison Table (MANDATORY)",
  "4. Best Tools by Category",
  "5. Conclusion",
  "STRICT:",
  "* Include pricing comparison",
  "* Include pros/cons",
  "* No repetition",
  "* No off-topic tools",
].join(" ");