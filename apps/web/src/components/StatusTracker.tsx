import React from "react";

type Stage = "planning" | "research" | "scraping" | "summarizing" | "completed";

interface StatusTrackerProps {
  currentStage: Stage;
}

const STAGE_MAP: Record<Stage, string> = {
  planning: "Planning...",
  research: "Researching...",
  scraping: "Scraping...",
  summarizing: "Summarizing...",
  completed: "Completed",
};

const STAGES: Stage[] = ["planning", "research", "scraping", "summarizing"];

export default function StatusTracker({ currentStage }: StatusTrackerProps) {
  const currentIndex = STAGES.indexOf(currentStage);

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="flex flex-col items-center space-y-2">
        <h3 className="text-xl font-semibold text-slate-900">
          {STAGE_MAP[currentStage] || "Processing..."}
        </h3>
        <p className="text-sm text-slate-500">
          The AI agent is working through the research steps.
        </p>
      </div>

      <div className="relative mt-8">
        <div className="absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 bg-slate-200" />
        <div 
          className="absolute left-0 top-1/2 h-0.5 bg-teal-600 transition-all duration-500 ease-in-out -translate-y-1/2"
          style={{ width: `${((currentIndex + 1) / STAGES.length) * 100}%` }}
        />
        
        <div className="relative flex justify-between">
          {STAGES.map((stage, index) => {
            const isCompleted = STAGES.indexOf(currentStage) > index;
            const isCurrent = currentStage === stage;
            
            return (
              <div key={stage} className="flex flex-col items-center">
                <div 
                  className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors duration-300 ${
                    isCompleted 
                      ? "border-teal-600 bg-teal-600 text-white" 
                      : isCurrent 
                        ? "border-teal-600 bg-white text-teal-600" 
                        : "border-slate-200 bg-white text-slate-400"
                  }`}
                >
                  {isCompleted ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="text-xs font-bold">{index + 1}</span>
                  )}
                </div>
                <span className={`mt-2 text-[10px] font-bold uppercase tracking-wider ${
                  isCurrent ? "text-teal-700" : "text-slate-400"
                }`}>
                  {stage}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
