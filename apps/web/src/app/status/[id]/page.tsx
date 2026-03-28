"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getStatus, type ResearchStatus } from "@/lib/api";

type Stage = ResearchStatus["currentStage"];

const STAGE_LABELS: Record<Stage, string> = {
  planning: "Planning research strategy...",
  research: "Analyzing search queries...",
  scraping: "Extracting data from web sources...",
  summarizing: "Synthesizing research report...",
  failed: "Research failed.",
  completed: "Research complete. Redirecting...",
};

export default function StatusPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [statusData, setStatusData] = useState<ResearchStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    let interval: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const data = await getStatus(id);
        setStatusData(data);

        if (data.status === "completed") {
          if (interval) {
            clearInterval(interval);
          }
          router.push(`/research/${id}`);
          return;
        }

        if (data.status === "failed") {
          if (interval) {
            clearInterval(interval);
          }
          setError("Research job failed. Please try again.");
        }
      } catch (err) {
        if (interval) {
          clearInterval(interval);
        }
        setError(err instanceof Error ? err.message : "Failed to fetch status");
      }
    };

    poll(); // Initial fetch
    interval = setInterval(poll, 2000);

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [id, router]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl ring-1 ring-slate-200">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">Research Failed</h2>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
          <button
            onClick={() => router.push("/")}
            className="mt-6 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors"
          >
             Go Back Home
          </button>
        </div>
      </main>
    );
  }

  const currentStage = statusData?.currentStage || "planning";
  const stages: Stage[] = ["planning", "research", "scraping", "summarizing", "failed"];
  
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-lg space-y-8 text-center">
        <div className="relative">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-white shadow-lg ring-1 ring-slate-200">
            <svg className="h-10 w-10 animate-spin text-teal-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        </div>

        <div className="space-y-4">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {STAGE_LABELS[currentStage]}
          </h1>
          <p className="text-sm font-medium text-slate-500 uppercase tracking-widest">
            Agent ID: {id.slice(0, 8)}...
          </p>
        </div>

        <div className="mt-8 relative h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div 
            className="h-full bg-teal-600 transition-all duration-500 ease-in-out"
            style={{ width: `${((stages.indexOf(currentStage) + 1) / stages.length) * 100}%` }}
          />
        </div>

        <div className="grid grid-cols-4 gap-2">
          {stages.map((stage, idx) => {
            const isActive = stages.indexOf(currentStage) >= idx;
            return (
              <div key={stage} className="flex flex-col items-center space-y-2">
                <div 
                  className={`h-2 w-full rounded-full transition-colors ${isActive ? "bg-teal-600" : "bg-slate-200"}`}
                />
                <span className={`text-[10px] font-bold uppercase transition-colors ${isActive ? "text-teal-700" : "text-slate-400"}`}>
                  {stage}
                </span>
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm leading-relaxed text-slate-600">
            Our agent is currently visiting relevant web sources and synthesizing information. 
            <br />
            <strong>Do not close this window.</strong>
          </p>
        </div>
      </div>
    </main>
  );
}
