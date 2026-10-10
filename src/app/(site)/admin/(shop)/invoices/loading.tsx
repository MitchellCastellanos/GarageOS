export default function InvoicesLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-24 bg-slate-200 rounded mb-2" />
          <div className="h-4 w-32 bg-slate-100 rounded" />
        </div>
        <div className="h-10 w-36 bg-slate-200 rounded-lg" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-8 w-20 bg-slate-200 rounded-md" />
        ))}
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="hidden sm:grid grid-cols-[1fr_160px_120px_100px_110px] gap-4 px-5 py-3 bg-slate-50 border-b border-slate-200">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-4 bg-slate-200 rounded" />
          ))}
        </div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_160px_120px_100px_110px] gap-4 px-5 py-4 border-b border-slate-100">
            <div>
              <div className="h-4 w-20 bg-slate-200 rounded mb-1.5" />
              <div className="h-3 w-32 bg-slate-100 rounded" />
            </div>
            <div className="hidden sm:block h-4 bg-slate-100 rounded" />
            <div className="hidden sm:block h-4 bg-slate-100 rounded" />
            <div className="hidden sm:block h-6 w-16 bg-slate-100 rounded-full" />
            <div className="text-right">
              <div className="h-4 w-16 bg-slate-200 rounded ml-auto" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
