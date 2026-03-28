"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createResearch } from "@/lib/api";

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await createResearch(query);
      
      if (data.jobId) {
        router.push(`/status/${data.jobId}`);
      } else {
        throw new Error("No job ID received from the server.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center">
          <div className="mb-4 inline-flex items-center rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700 ring-1 ring-inset ring-teal-700/10">
            Powered by Autonomous AI
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            Autonomous Web Research
          </h1>
          <p className="mt-4 text-lg leading-8 text-slate-600 font-medium">
            Enter a topic, and our AI agent will plan, browse, and generate a comprehensive research report for you in real-time.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-10 space-y-5">
          <div className="relative">
            <input
              id="query"
              type="text"
              required
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., Comparative analysis of latest LLM reasoning capabilities"
              disabled={isLoading}
              className="block w-full rounded-3xl border-0 px-6 py-5 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-teal-600 sm:text-sm sm:leading-6 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 font-medium"
            />
          </div>

          {error && (
            <div className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700 ring-1 ring-inset ring-red-600/10 animate-shake">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !query.trim()}
            className="flex w-full items-center justify-center rounded-3xl bg-teal-700 px-6 py-5 text-sm font-bold text-white shadow-xl transition-all hover:bg-teal-800 hover:shadow-teal-900/20 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <div className="flex items-center space-x-2">
                <svg className="h-5 w-5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Initializing Agent...</span>
              </div>
            ) : (
              "Start Research Task"
            )}
          </button>
        </form>

        <div className="mt-12 grid grid-cols-1 gap-6 text-center text-xs font-bold text-slate-400 sm:grid-cols-3 tracking-widest uppercase">
          <div className="flex flex-col items-center space-y-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-md ring-1 ring-slate-200 text-slate-900">1</span>
            <span>Plan Objectives</span>
          </div>
          <div className="flex flex-col items-center space-y-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-md ring-1 ring-slate-200 text-slate-900">2</span>
            <span>Real-time Browsing</span>
          </div>
          <div className="flex flex-col items-center space-y-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-md ring-1 ring-slate-200 text-slate-900">3</span>
            <span>Synthesize Report</span>
          </div>
        </div>
      </div>
    </main>
  );
}
