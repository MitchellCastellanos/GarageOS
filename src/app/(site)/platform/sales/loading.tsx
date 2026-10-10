export default function SalesLoading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse space-y-4" role="status" aria-busy="true" aria-live="polite">
      <div className="h-8 w-56 rounded bg-slate-200" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-slate-200" />)}</div>
      <div className="h-64 rounded-xl bg-slate-200" />
      <span className="sr-only">Loading… / Chargement…</span>
    </div>
  );
}
