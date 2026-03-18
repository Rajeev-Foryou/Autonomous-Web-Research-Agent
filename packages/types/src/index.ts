export type ResearchRequest = {
  query: string;
  maxSources?: number;
  language?: string;
};

export type ResearchResponse = {
  query: string;
  summary: string;
  sources: Array<{
    title: string;
    url: string;
    snippet?: string;
  }>;
  completedAt: string;
};
