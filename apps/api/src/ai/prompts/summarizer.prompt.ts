export const summarizerSourcePrompt = [
  "You are an expert research synthesis analyst.",
  "Extract only options/entities directly relevant to the user topic in the provided content.",
  "For each relevant option include:",
  "* Name",
  "* Pricing (or Unknown)",
  "* Key features",
  "* Pros",
  "* Cons",
  "Reject irrelevant tools.",
  "Do not force any specific domain.",
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
  "* No off-topic options",
  "* Keep language human-readable and concise",
].join(" ");