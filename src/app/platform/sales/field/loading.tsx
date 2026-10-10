export default function Loading() {
  return <div role="status" aria-live="polite" className="mx-auto max-w-6xl animate-pulse space-y-4"><div className="h-8 w-56 rounded bg-slate-200" /><div className="h-40 rounded-xl bg-slate-100" /><div className="h-40 rounded-xl bg-slate-100" /><span className="sr-only">Loading…</span></div>;
}
