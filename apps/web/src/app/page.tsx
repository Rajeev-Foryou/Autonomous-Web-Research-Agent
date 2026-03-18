export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-6 py-12">
      <section className="w-full rounded-2xl border border-slate-300 bg-white/90 p-8 shadow-lg backdrop-blur">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Autonomous Web Research Agent
        </h1>
        <p className="mt-3 text-slate-600">
          Start a research task by providing a query. API integration comes next.
        </p>

        <form className="mt-8 space-y-4">
          <label htmlFor="query" className="block text-sm font-medium text-slate-800">
            Research Query
          </label>
          <input
            id="query"
            type="text"
            placeholder="e.g., Emerging trends in autonomous browser agents"
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-200"
          />
          <button
            type="button"
            className="rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-800"
          >
            Start Research
          </button>
        </form>
      </section>
    </main>
  );
}
