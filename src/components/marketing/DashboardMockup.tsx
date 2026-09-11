import {
  Bell,
  Calendar,
  Car,
  ClipboardList,
  FileText,
  LayoutGrid,
  MessageSquare,
  Package,
  Receipt,
  Search,
  Settings,
  Users,
  Wrench,
} from "lucide-react";
import { GarageOSAppIcon } from "@/components/marketing/GarageOSLogo";

const NAV_ICONS = [
  LayoutGrid,
  Calendar,
  Wrench,
  Users,
  Car,
  Receipt,
  FileText,
  MessageSquare,
  ClipboardList,
  Package,
  Settings,
  Bell,
];

const STATUS_STYLE: Record<string, string> = {
  "Checked In": "bg-emerald-50 text-emerald-600",
  "In Progress": "bg-amber-50 text-amber-600",
  Scheduled: "bg-blue-50 text-brand-blue",
  Arrivé: "bg-emerald-50 text-emerald-600",
  "En cours": "bg-amber-50 text-amber-600",
  Prévu: "bg-blue-50 text-brand-blue",
};

interface DashboardMockupProps {
  greeting: string;
  subtitle: string;
  shopName: string;
  searchPlaceholder: string;
  stats: { value: string; label: string }[];
  nav: string[];
  scheduleTitle: string;
  viewCalendar: string;
  schedule: { time: string; vehicle: string; client: string; service: string; status: string }[];
  activityTitle: string;
  activity: { text: string; time: string }[];
}

export function DashboardMockup(props: DashboardMockupProps) {
  const {
    greeting,
    subtitle,
    shopName,
    searchPlaceholder,
    stats,
    nav,
    scheduleTitle,
    viewCalendar,
    schedule,
    activityTitle,
    activity,
  } = props;

  return (
    <div className="rounded-2xl border-4 border-slate-900 bg-white shadow-2xl shadow-slate-900/20 overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-4 border-b border-slate-100 px-4 py-3 bg-white">
        <div className="flex items-center gap-2 shrink-0">
          <GarageOSAppIcon className="h-6 w-6" />
          <span className="font-semibold text-slate-900 text-sm hidden sm:inline">GarageOS</span>
        </div>
        <div className="flex-1 hidden sm:flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 text-xs text-slate-400">
          <Search className="w-3.5 h-3.5" />
          {searchPlaceholder}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <div className="w-6 h-6 rounded-full bg-brand-blue text-white text-[10px] font-semibold flex items-center justify-center">
            A
          </div>
          <span className="text-xs text-slate-500 hidden md:inline">{shopName}</span>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <div className="hidden sm:flex w-14 shrink-0 flex-col items-center gap-3 border-r border-slate-100 bg-slate-50/60 py-4">
          {nav.slice(0, 8).map((label, i) => {
            const Icon = NAV_ICONS[i] ?? LayoutGrid;
            return (
              <div
                key={label}
                title={label}
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  i === 0 ? "bg-brand-blue text-white" : "text-slate-400"
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
            );
          })}
        </div>

        {/* Main */}
        <div className="flex-1 min-w-0 p-4 sm:p-5 bg-slate-50/40">
          <p className="font-semibold text-slate-900 text-sm sm:text-base">{greeting}</p>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
            {stats.map((stat, i) => (
              <div key={stat.label} className="bg-white border border-slate-100 rounded-lg p-2.5">
                <p
                  className={`text-lg font-bold ${
                    i === 2 ? "text-amber-500" : i === 3 ? "text-emerald-500" : "text-slate-900"
                  }`}
                >
                  {stat.value}
                </p>
                <p className="text-[10px] text-slate-500 leading-tight mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="grid sm:grid-cols-5 gap-3 mt-4">
            <div className="sm:col-span-3 bg-white border border-slate-100 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-700">{scheduleTitle}</p>
                <p className="text-[10px] text-brand-blue font-medium hidden sm:block">{viewCalendar}</p>
              </div>
              <div className="space-y-1.5">
                {schedule.map((row) => (
                  <div key={row.time} className="flex items-center gap-2 text-[10px] sm:text-[11px]">
                    <span className="text-slate-400 w-12 sm:w-14 shrink-0">{row.time}</span>
                    <span className="text-slate-700 flex-1 truncate">
                      {row.vehicle} <span className="text-slate-400">· {row.client}</span>
                    </span>
                    <span
                      className={`shrink-0 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${
                        STATUS_STYLE[row.status] ?? "bg-slate-50 text-slate-500"
                      }`}
                    >
                      {row.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="sm:col-span-2 bg-white border border-slate-100 rounded-lg p-3">
              <p className="text-xs font-semibold text-slate-700 mb-2">{activityTitle}</p>
              <div className="space-y-2">
                {activity.map((item) => (
                  <div key={item.text} className="flex items-start gap-2 text-[10px] sm:text-[11px]">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-brand-blue shrink-0" />
                    <div className="min-w-0">
                      <p className="text-slate-700 truncate">{item.text}</p>
                      <p className="text-slate-400">{item.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
