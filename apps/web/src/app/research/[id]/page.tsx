"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getResult, type ResearchResult } from "@/lib/api";
import MetricsCard from "@/components/MetricsCard";

type ParsedComparison = {
  intro: string[];
  headers: string[];
  rows: string[][];
  fallbackLines: string[];
};

function parsePipeTable(input: string): ParsedComparison {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const headerIndex = lines.findIndex((line) => line.includes("|") && !line.startsWith("- "));

  if (headerIndex < 0) {
    return {
      intro: [],
      headers: [],
      rows: [],
      fallbackLines: lines,
    };
  }

  const headerLine = lines[headerIndex];
  const headers = headerLine
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);

  if (headers.length < 2) {
    return {
      intro: [],
      headers: [],
      rows: [],
      fallbackLines: lines,
    };
  }

  const nextLine = lines[headerIndex + 1] ?? "";
  const hasDivider = /^[-|\s]+$/.test(nextLine);
  const startRowIndex = hasDivider ? headerIndex + 2 : headerIndex + 1;

  const rows = lines
    .slice(startRowIndex)
    .filter((line) => line.includes("|"))
    .map((line) =>
      line
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean)
    )
    .filter((cells) => cells.length >= 2)
    .map((cells) => {
      const normalized = cells.slice(0, headers.length);

      while (normalized.length < headers.length) {
        normalized.push("-");
      }

      return normalized;
    });

  if (rows.length === 0) {
    return {
      intro: [],
      headers: [],
      rows: [],
      fallbackLines: lines,
    };
  }

  return {
    intro: lines.slice(0, headerIndex),
    headers,
    rows,
    fallbackLines: [],
  };
}

export default function ResearchPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [data, setData] = useState<ResearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchResult = async () => {
      try {
        const result = await getResult(id);
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load research report.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchResult();
  }, [id]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center space-y-4 bg-slate-50">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
        <p className="text-slate-500 font-medium">Finalizing your report...</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl ring-1 ring-slate-200">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="mt-4 text-xl font-bold text-slate-900">Report Not Found</h2>
          <p className="mt-2 text-slate-600">
            {error || "We couldn't retrieve the research report for this ID."}
          </p>
          <button
            onClick={() => router.push("/")}
            className="mt-6 w-full rounded-2xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-teal-800 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </main>
    );
  }

  const { report, sources } = data;
  const parsedComparison = parsePipeTable(report.comparison);

  return (
    <main className="min-h-screen bg-white pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto max-w-4xl px-6 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className="h-8 w-8 rounded-lg bg-teal-700 flex items-center justify-center text-white font-bold text-lg">A</div>
            <span className="font-bold text-slate-900">Research Agent</span>
          </div>
          <button 
            onClick={() => window.print()}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
          >
            Export PDF
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <div className="mx-auto max-w-4xl px-6 pt-16">
        <div className="mb-6 inline-flex items-center rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700 ring-1 ring-inset ring-teal-700/10">
          AI-Generated Final Report
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl leading-tight">
          {report.title}
        </h1>
        <p className="mt-6 text-lg text-slate-500 max-w-2xl leading-relaxed">
          Comprehensive synthesis of browser-based research conducted by the Autonomous Web Research Agent.
        </p>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-4xl px-6 mt-16 space-y-16">
        <MetricsCard />
        
        {/* Key Insights */}
        <section className="space-y-6">
          <div className="flex items-center space-x-3">
            <span className="h-px flex-1 bg-slate-200"></span>
            <h2 className="text-sm font-bold uppercase tracking-widest text-teal-600">Key Insights</h2>
            <span className="h-px flex-1 bg-slate-200"></span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {report.keyInsights.map((insight, idx) => (
              <div key={idx} className="rounded-3xl border border-slate-100 bg-slate-50/50 p-8 hover:bg-white hover:shadow-xl transition-all duration-300">
                <span className="text-3xl mb-4 block">💡</span>
                <p className="text-slate-700 leading-relaxed font-medium">{insight}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Comparison */}
        <section className="space-y-6">
          <div className="flex items-center space-x-3">
            <span className="h-px flex-1 bg-slate-200"></span>
            <h2 className="text-sm font-bold uppercase tracking-widest text-teal-600">Comparative Analysis</h2>
            <span className="h-px flex-1 bg-slate-200"></span>
          </div>
          <div className="prose prose-slate max-w-none">
            <div className="rounded-3xl border border-slate-200 p-8 leading-relaxed text-slate-700 bg-white">
              {parsedComparison.headers.length > 0 ? (
                <div className="space-y-4">
                  {parsedComparison.intro.map((line, idx) => (
                    <p key={idx} className="text-slate-600">
                      {line}
                    </p>
                  ))}

                  <div className="overflow-x-auto rounded-2xl border border-slate-200">
                    <table className="min-w-full border-collapse text-left">
                      <thead className="bg-slate-50">
                        <tr>
                          {parsedComparison.headers.map((header, idx) => (
                            <th
                              key={idx}
                              className="border-b border-slate-200 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600"
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parsedComparison.rows.map((row, rowIdx) => (
                          <tr key={rowIdx} className="hover:bg-slate-50/70">
                            {row.map((cell, cellIdx) => (
                              <td key={cellIdx} className="border-b border-slate-100 px-4 py-3 align-top text-sm text-slate-700">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 whitespace-pre-wrap break-words">
                  {parsedComparison.fallbackLines.map((line, idx) => (
                    <p key={idx} className="text-slate-700">
                      {line}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Conclusion */}
        <section className="space-y-6">
          <div className="flex items-center space-x-3">
            <span className="h-px flex-1 bg-slate-200"></span>
            <h2 className="text-sm font-bold uppercase tracking-widest text-teal-600">Strategic Conclusion</h2>
            <span className="h-px flex-1 bg-slate-200"></span>
          </div>
          <div className="rounded-3xl bg-teal-900 p-10 text-white shadow-2xl overflow-hidden relative">
            <div className="absolute top-0 right-0 -mr-12 -mt-12 w-48 h-48 bg-teal-800/30 rounded-full blur-3xl"></div>
            <p className="text-xl leading-relaxed font-medium relative z-10 antialiased">
              {report.conclusion}
            </p>
          </div>
        </section>

        {/* Sources */}
        {sources && sources.length > 0 && (
          <section className="pt-8 border-t border-slate-200 space-y-6">
            <h3 className="text-lg font-bold text-slate-900">Research Sources</h3>
            <div className="flex flex-wrap gap-3">
              {sources.map((source, idx) => (
                <a 
                  key={idx}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:border-teal-300 hover:text-teal-700 hover:shadow-sm transition-all"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                  </svg>
                  <span>{source.title}</span>
                </a>
              ))}
            </div>
          </section>
        )}

        <div className="pt-16 text-center">
          <button 
             onClick={() => router.push("/")}
             className="text-sm font-bold text-slate-400 hover:text-teal-700 uppercase tracking-widest transition-colors"
          >
             Start New Research
          </button>
        </div>
      </div>
    </main>
  );
}
