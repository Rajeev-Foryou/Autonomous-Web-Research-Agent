import React from "react";

interface LoaderProps {
  label?: string;
  className?: string;
}

export default function Loader({ label = "Loading...", className = "" }: LoaderProps) {
  return (
    <div className={`flex flex-col items-center justify-center p-8 space-y-4 ${className}`}>
      <div className="relative flex items-center justify-center">
        <div className="h-12 w-12 rounded-full border-4 border-slate-200" />
        <div className="absolute h-12 w-12 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
      </div>
      {label && <p className="text-slate-500 font-medium text-sm animate-pulse">{label}</p>}
    </div>
  );
}
