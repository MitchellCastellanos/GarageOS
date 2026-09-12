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
import type { AdminLocale } from "@/lib/admin-locale";
import { APPOINTMENTS_DICT } from "@/lib/admin-locale/appointments";

interface AppointmentViewControlsProps {
  view: AppointmentView;
  anchor: string;
  timeZone: string;
  locale: AdminLocale;
}

function appointmentsUrl(view: AppointmentView, date: string) {
  return `${ADMIN.appointments}?view=${view}&date=${date}`;
}

function formatMonthLabel(month: string, intlLocale: string) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric" }).format(d);
}

function formatWeekLabel(weekStart: string, timeZone: string, intlLocale: string) {
  const end = addShopDays(weekStart, 6, timeZone);
  const fmt = new Intl.DateTimeFormat(intlLocale, {
    timeZone,
    day: "numeric",
    month: "short",
  });
  const startAt = parseShopDateTime(weekStart, "12:00", timeZone);
  const endAt = parseShopDateTime(end, "12:00", timeZone);
  return `${fmt.format(startAt)} — ${fmt.format(endAt)}`;
}

function formatDayLabel(day: string, timeZone: string, intlLocale: string) {
  return new Intl.DateTimeFormat(intlLocale, {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parseShopDateTime(day, "12:00", timeZone));
}

function prevNextDates(view: AppointmentView, anchor: string, timeZone: string, intlLocale: string) {
  if (view === "month") {
    const month = anchor.length === 7 ? anchor : anchor.slice(0, 7);
    return {
      prev: shiftMonth(month, -1) + "-01",
      next: shiftMonth(month, 1) + "-01",
      label: formatMonthLabel(month, intlLocale),
    };
  }
  if (view === "week") {
    const { weekStart } = getWeekRangeShop(anchor, timeZone);
    return {
      prev: addShopDays(weekStart, -7, timeZone),
      next: addShopDays(weekStart, 7, timeZone),
      label: formatWeekLabel(weekStart, timeZone, intlLocale),
    };
  }
  return {
    prev: addShopDays(anchor, -1, timeZone),
    next: addShopDays(anchor, 1, timeZone),
    label: formatDayLabel(anchor, timeZone, intlLocale),
  };
}

export function AppointmentViewControls({ view, anchor, timeZone, locale }: AppointmentViewControlsProps) {
  const t = APPOINTMENTS_DICT[locale].viewControls;
  const VIEW_OPTIONS: { id: AppointmentView; label: string }[] = [
    { id: "month", label: t.viewOptions.month },
    { id: "week", label: t.viewOptions.week },
    { id: "day", label: t.viewOptions.day },
  ];
  const { prev, next, label } = prevNextDates(view, anchor, timeZone, t.intlLocale);
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
          {t.previous}
        </Link>
        <span className="text-sm font-semibold text-slate-900 capitalize">{label}</span>
        <Link
          href={appointmentsUrl(view, next)}
          className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 px-2 py-1 rounded-lg hover:bg-slate-50"
        >
          {t.next}
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
