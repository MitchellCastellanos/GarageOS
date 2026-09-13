import { ADMIN } from "@/lib/routes";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getAppointments } from "@/actions/appointments";
import { AppointmentList } from "@/components/appointments/AppointmentList";
import { AppointmentMonthCalendar } from "@/components/appointments/AppointmentMonthCalendar";
import { AppointmentViewControls } from "@/components/appointments/AppointmentViewControls";
import type { AppointmentView } from "@/lib/shop-timezone";
import { monthFromDate } from "@/lib/shop-timezone";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { APPOINTMENTS_DICT } from "@/lib/admin-locale/appointments";

interface PageProps {
  searchParams: Promise<{ view?: string; date?: string; week?: string }>;
}

export default async function AppointmentsPage({ searchParams }: PageProps) {
  const locale = await getAdminLocale();
  const t = APPOINTMENTS_DICT[locale];
  const params = await searchParams;
  const view = (["month", "week", "day"].includes(params.view ?? "")
    ? params.view
    : "month") as AppointmentView;
  const date = params.date ?? params.week;

  const { appointments, anchor, timeZone, view: resolvedView } = await getAppointments({
    view,
    date,
    week: params.week,
  });

  const month =
    resolvedView === "month"
      ? anchor.length === 7
        ? anchor
        : monthFromDate(anchor)
      : monthFromDate(anchor);

  const viewLabel = t.list.viewLabels[resolvedView];
  const countLabel = t.list.countLabel(appointments.length, viewLabel);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.list.pageTitle}</h1>
          <p className="text-slate-500 text-sm mt-1">{countLabel}</p>
        </div>
        <Link
          href={`${ADMIN.appointments}/new`}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t.list.newAppointment}
        </Link>
      </div>

      <AppointmentViewControls view={resolvedView} anchor={anchor} timeZone={timeZone} locale={locale} />

      {resolvedView === "month" ? (
        <AppointmentMonthCalendar
          month={month}
          appointments={appointments}
          timeZone={timeZone}
          locale={locale}
        />
      ) : (
        <AppointmentList
          appointments={appointments}
          timeZone={timeZone}
          emptyLabel={t.list.emptyForView(viewLabel)}
        />
      )}
    </div>
  );
}
