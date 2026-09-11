"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface MonthCalendarProps {
  /** Todas las fechas ISO (YYYY-MM-DD) dentro de la ventana de reserva, ascendente. */
  dates: string[];
  availableDates: Set<string>;
  selectedDate: string;
  onSelect: (date: string) => void;
  intlLocale: string;
  prevMonthLabel: string;
  nextMonthLabel: string;
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function MonthCalendar({
  dates,
  availableDates,
  selectedDate,
  onSelect,
  intlLocale,
  prevMonthLabel,
  nextMonthLabel,
}: MonthCalendarProps) {
  const minDate = dates[0] ? parseISO(dates[0]) : new Date();
  const maxDate = dates[dates.length - 1] ? parseISO(dates[dates.length - 1]) : minDate;

  const [viewDate, setViewDate] = useState(() =>
    startOfMonth(selectedDate ? parseISO(selectedDate) : minDate)
  );

  const canGoPrev = viewDate > startOfMonth(minDate);
  const canGoNext = viewDate < startOfMonth(maxDate);

  const weekdayLabels = useMemo(() => {
    const monday = new Date(2024, 0, 1); // un lunes cualquiera, solo para nombrar días
    const fmt = new Intl.DateTimeFormat(intlLocale, { weekday: "short" });
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return fmt.format(d);
    });
  }, [intlLocale]);

  const monthLabel = new Intl.DateTimeFormat(intlLocale, {
    month: "long",
    year: "numeric",
  }).format(viewDate);

  const cells = useMemo(() => {
    const firstOfMonth = startOfMonth(viewDate);
    const startOffset = (firstOfMonth.getDay() + 6) % 7; // lunes = 0
    const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();

    const result: { iso: string; day: number }[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
      result.push({ iso: toISO(d), day });
    }
    return { startOffset, days: result };
  }, [viewDate]);

  return (
    <div className="max-w-[320px] mx-auto">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => canGoPrev && setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
          disabled={!canGoPrev}
          aria-label={prevMonthLabel}
          className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed hover:border-red-300 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className="text-sm font-semibold text-slate-900 capitalize">{monthLabel}</p>
        <button
          type="button"
          onClick={() => canGoNext && setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
          disabled={!canGoNext}
          aria-label={nextMonthLabel}
          className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed hover:border-red-300 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {weekdayLabels.map((w) => (
          <div key={w} className="text-[10px] font-medium text-slate-400 uppercase py-0.5">
            {w}
          </div>
        ))}

        {Array.from({ length: cells.startOffset }, (_, i) => (
          <div key={`pad-${i}`} />
        ))}

        {cells.days.map(({ iso, day }) => {
          const isAvailable = availableDates.has(iso);
          const isSelected = iso === selectedDate;
          return (
            <button
              key={iso}
              type="button"
              disabled={!isAvailable}
              onClick={() => onSelect(iso)}
              className={[
                "aspect-square rounded-lg text-sm transition-colors",
                isSelected
                  ? "bg-brand-red text-white font-semibold"
                  : isAvailable
                    ? "bg-white border border-slate-200 text-slate-700 hover:border-red-300 font-medium"
                    : "text-slate-300 cursor-not-allowed",
              ].join(" ")}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
