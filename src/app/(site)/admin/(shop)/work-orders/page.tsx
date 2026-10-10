import { ADMIN, adminPath } from "@/lib/routes";
import Link from "next/link";
import { Wrench, Plus } from "lucide-react";
import { getWorkOrders } from "@/actions/work-orders";
import { formatDate } from "@/lib/utils";
import { formatClientName } from "@/lib/client-name";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { WORK_ORDERS_DICT } from "@/lib/admin-locale/work-orders";

const STATUS_BADGE: Record<string, string> = {
  OPEN: "bg-slate-100 text-slate-600",
  AWAITING_APPROVAL: "bg-amber-100 text-amber-700",
  APPROVED: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-indigo-100 text-indigo-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  INVOICED: "bg-teal-100 text-teal-700",
  CANCELLED: "bg-slate-100 text-slate-400",
};

const JOB_STATUS_BADGE: Record<string, string> = {
  CHECKED_IN: "bg-slate-100 text-slate-600",
  WAITING_APPROVAL: "bg-amber-100 text-amber-700",
  WAITING_PARTS: "bg-amber-100 text-amber-700",
  IN_SERVICE: "bg-indigo-100 text-indigo-700",
  READY_FOR_PICKUP: "bg-emerald-100 text-emerald-700",
  COMPLETED: "bg-teal-100 text-teal-700",
};

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function WorkOrdersPage({ searchParams }: PageProps) {
  const { status } = await searchParams;
  const activeTab = status ?? "ALL";
  const workOrders = await getWorkOrders(activeTab);
  const locale = await getAdminLocale();
  const t = WORK_ORDERS_DICT[locale];

  const STATUS_TABS = [
    { value: "ALL", label: t.list.statusTabAll },
    { value: "OPEN", label: t.status.OPEN },
    { value: "AWAITING_APPROVAL", label: t.status.AWAITING_APPROVAL },
    { value: "APPROVED", label: t.status.APPROVED },
    { value: "IN_PROGRESS", label: t.status.IN_PROGRESS },
    { value: "COMPLETED", label: t.status.COMPLETED },
    { value: "INVOICED", label: t.status.INVOICED },
    { value: "CANCELLED", label: t.status.CANCELLED },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.list.title}</h1>
          <p className="text-slate-500 text-sm mt-1">
            {workOrders.length} {workOrders.length !== 1 ? t.list.countSuffix : t.list.countSuffixSingular}
            {activeTab !== "ALL" ? ` · ${t.status[activeTab as keyof typeof t.status] ?? activeTab}` : ""}
          </p>
        </div>
        <Link
          href={`${ADMIN.workOrders}/new`}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t.list.newWorkOrder}
        </Link>
      </div>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit flex-wrap">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={tab.value === "ALL" ? "/work-orders" : `/work-orders?status=${tab.value}`}
            className={[
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              activeTab === tab.value
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700",
            ].join(" ")}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {workOrders.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">
            {activeTab === "ALL" ? t.list.emptyAll : t.list.emptyStatus(t.status[activeTab as keyof typeof t.status] ?? activeTab)}
          </p>
          {activeTab === "ALL" && (
            <Link
              href={`${ADMIN.workOrders}/new`}
              className="mt-4 inline-flex items-center gap-2 text-blue-600 hover:underline text-sm"
            >
              <Plus className="w-4 h-4" />
              {t.list.createFirst}
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="hidden sm:grid grid-cols-[1fr_180px_150px_110px_120px_140px] gap-4 px-5 py-3 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500 uppercase">
            <span>{t.list.colOrderClient}</span>
            <span>{t.list.colVehicle}</span>
            <span>{t.list.colMechanic}</span>
            <span>{t.list.colDate}</span>
            <span>{t.list.colStatus}</span>
            <span>{t.list.colJobStatus}</span>
          </div>

          <div className="divide-y divide-slate-100">
            {workOrders.map((wo) => (
              <Link
                key={wo.id}
                href={adminPath(`/work-orders/${wo.id}`)}
                className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_180px_150px_110px_120px_140px] gap-4 px-5 py-4 items-center hover:bg-slate-50 transition-colors"
              >
                <div>
                  <p className="font-medium text-slate-900 text-sm">{wo.orderNumber}</p>
                  <p className="text-slate-500 text-sm">{formatClientName(wo.client)}</p>
                </div>
                <div className="hidden sm:block">
                  <p className="text-sm text-slate-700">
                    {wo.vehicle.year} {wo.vehicle.make} {wo.vehicle.model}
                  </p>
                  <p className="text-xs text-slate-400">{wo.vehicle.licensePlate}</p>
                </div>
                <div className="hidden sm:block text-sm text-slate-600">
                  {wo.mechanic?.name ?? t.list.unassigned}
                </div>
                <div className="hidden sm:block text-sm text-slate-600">{formatDate(wo.createdAt)}</div>
                <div>
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[wo.status] ?? "bg-slate-100 text-slate-500"}`}
                  >
                    {t.status[wo.status as keyof typeof t.status] ?? wo.status}
                  </span>
                </div>
                <div className="hidden sm:block">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${JOB_STATUS_BADGE[wo.jobStatus] ?? "bg-slate-100 text-slate-500"}`}
                  >
                    {t.jobStatus[wo.jobStatus as keyof typeof t.jobStatus] ?? wo.jobStatus}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
