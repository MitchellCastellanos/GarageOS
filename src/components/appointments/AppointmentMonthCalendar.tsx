"use client";

import Link from "next/link";
import { ADMIN } from "@/lib/routes";
import { formatClientName } from "@/lib/client-name";
import { formatShopDate, formatShopTime, getShopDayOfWeek } from "@/lib/shop-timezone";

interface Appointment {
  id: string;
  title: string;
  startsAt: Date | string;
  status: string;
  client: { firstName: string; lastName?: string | null };
}

interface AppointmentMonthCalendarProps {
  month: string;
  appointments: Appointment[];
  timeZone: string;
}

const WEEKDAYS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];

function buildCalendarCells(month: string, timeZone: string) {
  const [y, m] = month.split("-").map(Number);
  const firstOfMonth = `${y}-${String(m).padStart(2, "0")}-01`;
  const daysInMonth = new Date(y, m, 0).getDate();
  const startWeekday = getShopDayOfWeek(firstOfMonth, timeZone);
  const mondayOffset = startWeekday === 0 ? 6 : startWeekday - 1;

  const cells: { date: string | null; day: number | null }[] = [];

  for (let i = 0; i < mondayOffset; i++) {
    cells.push({ date: null, day: null });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ date, day: d });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ date: null, day: null });
  }

  return cells;
}

export function AppointmentMonthCalendar({
  month,
  appointments,
  timeZone,
}: AppointmentMonthCalendarProps) {
  const cells = buildCalendarCells(month, timeZone);
  const today = formatShopDate(new Date(), timeZone);

  const byDay = new Map<string, Appointment[]>();
  for (const apt of appointments) {
    const key = formatShopDate(new Date(apt.startsAt), timeZone);
    const list = byDay.get(key) ?? [];
    list.push(apt);
    byDay.set(key, list);
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50">
        {WEEKDAYS.map((label) => (
          <div
            key={label}
            className="px-2 py-2 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
        {cells.map((cell, idx) => {
          if (!cell.date) {
            return <div key={`empty-${idx}`} className="min-h-[100px] bg-slate-50/50" />;
          }

          const dayAppointments = byDay.get(cell.date) ?? [];
          const isToday = cell.date === today;

          return (
            <div
              key={cell.date}
              className={`min-h-[100px] p-1.5 flex flex-col ${isToday ? "bg-teal-50/60" : ""}`}
            >
              <Link
                href={`${ADMIN.appointments}?view=day&date=${cell.date}`}
                className={`inline-flex w-7 h-7 items-center justify-center rounded-full text-xs font-semibold mb-1 hover:bg-teal-100 transition-colors ${
                  isToday ? "bg-teal-600 text-white hover:bg-teal-700" : "text-slate-700"
                }`}
              >
                {cell.day}
              </Link>
              <div className="space-y-0.5 flex-1 overflow-hidden">
                {dayAppointments.slice(0, 3).map((apt) => (
                  <Link
                    key={apt.id}
                    href={`${ADMIN.appointments}/${apt.id}/edit`}
                    className={`block text-[10px] leading-tight px-1 py-0.5 rounded truncate transition-colors ${
                      apt.status === "CANCELLED"
                        ? "bg-slate-100 text-slate-400 line-through hover:bg-slate-200"
                        : "bg-teal-100 text-teal-800 hover:bg-teal-200"
                    }`}
                    title={`${formatShopTime(new Date(apt.startsAt), timeZone)} — ${apt.title} (${formatClientName(apt.client)})`}
                  >
                    <span className="font-medium">
                      {formatShopTime(new Date(apt.startsAt), timeZone)}
                    </span>{" "}
                    {apt.title}
                  </Link>
                ))}
                {dayAppointments.length > 3 && (
                  <Link
                    href={`${ADMIN.appointments}?view=day&date=${cell.date}`}
                    className="text-[10px] text-teal-700 font-medium px-1 hover:underline"
                  >
                    +{dayAppointments.length - 3} más
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
