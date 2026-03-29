"use client";

import { useEffect, useState } from "react";
import { getMetrics, type MetricsResponse } from "@/lib/api";

export default function MetricsCard() {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadMetrics() {
      try {
        const data = await getMetrics();

        if (!cancelled) {
          setMetrics(data);
        }
      } catch {
        if (!cancelled) {
          setHasError(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadMetrics();

    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-500">Loading system metrics...</p>
      </section>
    );
  }

  if (hasError || !metrics) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-500">Metrics unavailable right now.</p>
      </section>
    );
  }

  const successRatePercent = `${Math.round(metrics.successRate * 100)}%`;
  const avgTimeSeconds = `${(metrics.avgCompletionTimeMs / 1000).toFixed(1)}s`;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">System Metrics</h3>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-emerald-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Success Rate</p>
          <p className="mt-1 text-xl font-semibold text-emerald-900">{successRatePercent}</p>
        </div>

        <div className="rounded-lg bg-sky-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-sky-700">Avg Time</p>
          <p className="mt-1 text-xl font-semibold text-sky-900">{avgTimeSeconds}</p>
        </div>

        <div className="rounded-lg bg-slate-100 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-700">Total Jobs</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{metrics.totalJobs}</p>
        </div>
      </div>
    </section>
  );
}
