import { History, MessageSquare, Mail, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { AppointmentHistoryEntry } from "@/lib/appointment-events";
import type { AdminLocale } from "@/lib/admin-locale";
import { APPOINTMENTS_DICT } from "@/lib/admin-locale/appointments";
import { appointmentStatusLabel } from "@/lib/appointment-status";
import { formatShopDateTime } from "@/lib/shop-timezone";

interface AppointmentHistoryProps {
  entries: AppointmentHistoryEntry[];
  locale: AdminLocale;
  timeZone: string;
}

/** Campos cuyo valor se muestra (antes → después); del resto solo se nombra que cambió. */
function formatChangeValue(field: string, value: unknown, locale: AdminLocale, timeZone: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "startsAt" && typeof value === "string") return formatShopDateTime(new Date(value), timeZone);
  if (field === "status" && typeof value === "string") return appointmentStatusLabel(value, locale);
  if (field === "durationMinutes") return `${value} min`;
  return String(value);
}

const VALUE_FIELDS = new Set(["startsAt", "status", "title", "durationMinutes"]);

export function AppointmentHistory({ entries, locale, timeZone }: AppointmentHistoryProps) {
  const t = APPOINTMENTS_DICT[locale].history;

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-2">
        <History className="w-4 h-4 text-slate-500" />
        <h2 className="font-semibold text-slate-900">{t.title}</h2>
      </div>
      <p className="text-xs text-slate-500 mt-1">{t.subtitle}</p>

      {entries.length === 0 ? (
        <p className="text-sm text-slate-500 mt-4">{t.empty}</p>
      ) : (
        <ol className="mt-4 space-y-4">
          {entries.map((entry) => {
            const actor =
              entry.actorType === "SYSTEM"
                ? t.system
                : t.by(entry.actorName ?? (entry.actorType === "CLIENT" ? t.client : "—"));
            const changedFields = Object.keys(entry.changes);
            const failed = entry.noticeOutcome && entry.noticeOutcome !== "SENT";

            return (
              <li key={entry.id} className="border-l-2 border-slate-200 pl-3">
                <p className="text-sm font-medium text-slate-900">{t.events[entry.type]}</p>
                <p className="text-xs text-slate-500">
                  {formatShopDateTime(entry.createdAt, timeZone)} · {actor}
                </p>

                {changedFields.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {changedFields.map((field) => {
                      const change = entry.changes[field];
                      const label = t.fields[field] ?? field;
                      return (
                        <li key={field} className="text-xs text-slate-600">
                          {VALUE_FIELDS.has(field) ? (
                            <>
                              {label}: {formatChangeValue(field, change.from, locale, timeZone)} →{" "}
                              <span className="font-medium text-slate-800">
                                {formatChangeValue(field, change.to, locale, timeZone)}
                              </span>
                            </>
                          ) : (
                            label
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {entry.notice && (
                  <div
                    className={`mt-1.5 inline-flex items-start gap-1.5 text-xs rounded-md px-2 py-1 ${
                      failed ? "bg-amber-50 text-amber-900" : "bg-teal-50 text-teal-900"
                    }`}
                  >
                    {failed ? (
                      <AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 mt-px flex-shrink-0" />
                    )}
                    <span>
                      {t.notices[entry.notice as keyof typeof t.notices] ?? entry.notice}
                      {entry.noticeOutcome ? ` — ${t.outcomes[entry.noticeOutcome]}` : ""}
                      {entry.deliveries.map((d) => (
                        <span key={`${d.channel}-${d.to.join(",")}`} className="flex items-center gap-1 mt-0.5">
                          {d.channel === "SMS" ? <MessageSquare className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
                          {d.to.join(", ")} · {t.deliveryStatus[d.status] ?? d.status}
                        </span>
                      ))}
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
