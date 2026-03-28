import React from "react";

interface StructuredReport {
  title: string;
  keyInsights: string[];
  comparison: string;
  conclusion: string;
}

interface ReportViewerProps {
  report: string | StructuredReport;
}

export default function ReportViewer({ report }: ReportViewerProps) {
  // Handle string report (fallback)
  if (typeof report === "string") {
    return (
      <div className="prose prose-slate max-w-none rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-bold text-slate-900 mb-4">Research Report</h2>
        <p className="whitespace-pre-wrap text-slate-700 leading-relaxed">{report}</p>
      </div>
    );
  }

  // Handle structured report
  return (
    <div className="space-y-16 py-8">
      {/* Title Section */}
      <section className="text-center md:text-left">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl leading-tight">
          {report.title}
        </h1>
        <div className="mt-4 h-1 w-24 bg-teal-600 rounded-full mx-auto md:mx-0"></div>
      </section>

      {/* Key Insights */}
      <section className="space-y-6">
        <div className="flex items-center space-x-3">
          <h2 className="text-sm font-bold uppercase tracking-widest text-teal-600">Key Insights</h2>
          <span className="h-px flex-1 bg-slate-200"></span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {report.keyInsights.map((insight, idx) => (
            <div key={idx} className="group rounded-3xl border border-slate-100 bg-slate-50/50 p-8 transition-all hover:bg-white hover:shadow-lg hover:ring-1 hover:ring-teal-100">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-100 text-teal-700 mb-4 transition-transform group-hover:scale-110">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18L12 12M12 12V6M12 12H6M12 12H18" />
                </svg>
              </div>
              <p className="text-slate-700 leading-relaxed font-medium">{insight}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison */}
      <section className="space-y-6">
        <div className="flex items-center space-x-3">
          <h2 className="text-sm font-bold uppercase tracking-widest text-teal-600">Comparative Analysis</h2>
          <span className="h-px flex-1 bg-slate-200"></span>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-lg leading-relaxed text-slate-700 whitespace-pre-wrap">
            {report.comparison}
          </p>
        </div>
      </section>

      {/* Conclusion */}
      <section className="space-y-6">
        <div className="flex items-center space-x-3">
          <h2 className="text-sm font-bold uppercase tracking-widest text-teal-600">Strategic Conclusion</h2>
          <span className="h-px flex-1 bg-slate-200"></span>
        </div>
        <div className="relative overflow-hidden rounded-3xl bg-slate-900 p-10 text-white shadow-2xl">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl"></div>
          <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl"></div>
          <p className="relative z-10 text-xl font-medium leading-relaxed antialiased italic">
            "{report.conclusion}"
          </p>
        </div>
      </section>
    </div>
  );
}
