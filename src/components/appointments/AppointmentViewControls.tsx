import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ADMIN } from "@/lib/routes";
import {
  type AppointmentView,
  addShopDays,
  getWeekRangeShop,
  parseShopDateTime,
  shiftMonth,
} from "@/lib/shop-timezone";

interface AppointmentViewControlsProps {
  view: AppointmentView;
  anchor: string;
  timeZone: string;
}

function appointmentsUrl(view: AppointmentView, date: string) {
  return `${ADMIN.appointments}?view=${view}&date=${date}`;
}

function formatMonthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return new Intl.DateTimeFormat("fr-CA", { month: "long", year: "numeric" }).format(d);
}

function formatWeekLabel(weekStart: string, timeZone: string) {
  const end = addShopDays(weekStart, 6, timeZone);
  const fmt = new Intl.DateTimeFormat("fr-CA", {
    timeZone,
    day: "numeric",
    month: "short",
  });
  const startAt = parseShopDateTime(weekStart, "12:00", timeZone);
  const endAt = parseShopDateTime(end, "12:00", timeZone);
  return `${fmt.format(startAt)} — ${fmt.format(endAt)}`;
}

function formatDayLabel(day: string, timeZone: string) {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parseShopDateTime(day, "12:00", timeZone));
}

function prevNextDates(view: AppointmentView, anchor: string, timeZone: string) {
  if (view === "month") {
    const month = anchor.length === 7 ? anchor : anchor.slice(0, 7);
    return {
      prev: shiftMonth(month, -1) + "-01",
      next: shiftMonth(month, 1) + "-01",
      label: formatMonthLabel(month),
    };
  }
  if (view === "week") {
    const { weekStart } = getWeekRangeShop(anchor, timeZone);
    return {
      prev: addShopDays(weekStart, -7, timeZone),
      next: addShopDays(weekStart, 7, timeZone),
      label: formatWeekLabel(weekStart, timeZone),
    };
  }
  return {
    prev: addShopDays(anchor, -1, timeZone),
    next: addShopDays(anchor, 1, timeZone),
    label: formatDayLabel(anchor, timeZone),
  };
}

const VIEW_OPTIONS: { id: AppointmentView; label: string }[] = [
  { id: "month", label: "Mes" },
  { id: "week", label: "Semana" },
  { id: "day", label: "Día" },
];

export function AppointmentViewControls({ view, anchor, timeZone }: AppointmentViewControlsProps) {
  const { prev, next, label } = prevNextDates(view, anchor, timeZone);
  const dateForView =
    view === "month"
      ? (anchor.length === 7 ? anchor : anchor.slice(0, 7)) + "-01"
      : view === "week"
        ? getWeekRangeShop(anchor, timeZone).weekStart
        : anchor;

  return (
    <div className="space-y-3">
      <div className="flex rounded-lg border border-slate-200 bg-white p-1 w-fit">
        {VIEW_OPTIONS.map((opt) => (
          <Link
            key={opt.id}
            href={appointmentsUrl(opt.id, dateForView)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              view === opt.id
                ? "bg-teal-600 text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {opt.label}
          </Link>
        ))}
      </div>

      <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 px-4 py-3">
        <Link
          href={appointmentsUrl(view, prev)}
          className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 px-2 py-1 rounded-lg hover:bg-slate-50"
        >
          <ChevronLeft className="w-4 h-4" />
          Anterior
        </Link>
        <span className="text-sm font-semibold text-slate-900 capitalize">{label}</span>
        <Link
          href={appointmentsUrl(view, next)}
          className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 px-2 py-1 rounded-lg hover:bg-slate-50"
        >
          Siguiente
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
