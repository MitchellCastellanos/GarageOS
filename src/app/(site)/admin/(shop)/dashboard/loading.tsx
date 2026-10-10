// Skeleton del dashboard — se muestra mientras carga el Server Component
export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-7 w-36 bg-slate-200 rounded mb-2" />
        <div className="h-4 w-48 bg-slate-100 rounded" />
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex justify-between mb-3">
              <div className="h-4 w-28 bg-slate-100 rounded" />
              <div className="w-9 h-9 bg-slate-100 rounded-lg" />
            </div>
            <div className="h-8 w-20 bg-slate-200 rounded" />
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <div className="h-5 w-48 bg-slate-200 rounded mb-4" />
          <div className="h-48 bg-slate-100 rounded-lg" />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="h-5 w-36 bg-slate-200 rounded mb-4" />
          <div className="h-48 bg-slate-100 rounded-full mx-auto w-48" />
        </div>
      </div>
    </div>
  );
}
