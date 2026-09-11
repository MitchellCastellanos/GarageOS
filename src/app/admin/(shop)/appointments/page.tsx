import { ADMIN } from "@/lib/routes";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getAppointments } from "@/actions/appointments";
import { AppointmentList } from "@/components/appointments/AppointmentList";
import { AppointmentMonthCalendar } from "@/components/appointments/AppointmentMonthCalendar";
import { AppointmentViewControls } from "@/components/appointments/AppointmentViewControls";
import type { AppointmentView } from "@/lib/shop-timezone";
import { monthFromDate } from "@/lib/shop-timezone";

interface PageProps {
  searchParams: Promise<{ view?: string; date?: string; week?: string }>;
}

const VIEW_LABELS: Record<AppointmentView, string> = {
  month: "este mes",
  week: "esta semana",
  day: "este día",
};

export default async function AppointmentsPage({ searchParams }: PageProps) {
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

  const countLabel = `${appointments.length} cita${appointments.length !== 1 ? "s" : ""} ${VIEW_LABELS[resolvedView]}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Citas</h1>
          <p className="text-slate-500 text-sm mt-1">{countLabel}</p>
        </div>
        <Link
          href={`${ADMIN.appointments}/new`}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nueva cita
        </Link>
      </div>

      <AppointmentViewControls view={resolvedView} anchor={anchor} timeZone={timeZone} />

      {resolvedView === "month" ? (
        <AppointmentMonthCalendar
          month={month}
          appointments={appointments}
          timeZone={timeZone}
        />
      ) : (
        <AppointmentList
          appointments={appointments}
          timeZone={timeZone}
          emptyLabel={`No hay citas ${VIEW_LABELS[resolvedView]}`}
        />
      )}
    </div>
  );
}
