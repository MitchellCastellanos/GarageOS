export default function ClientsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-7 w-24 bg-slate-200 rounded" />
        <div className="h-10 w-36 bg-slate-200 rounded-lg" />
      </div>

      {/* Search */}
      <div className="h-10 w-full bg-slate-100 rounded-lg" />

      {/* List */}
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center justify-between px-5 py-4">
            <div>
              <div className="h-4 w-36 bg-slate-200 rounded mb-1.5" />
              <div className="h-3 w-24 bg-slate-100 rounded" />
            </div>
            <div className="h-8 w-16 bg-slate-100 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
