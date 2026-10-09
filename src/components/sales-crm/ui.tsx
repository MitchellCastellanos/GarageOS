import Link from "next/link";
import type { ReactNode } from "react";
import { crmCopy, type CrmCopy } from "@/lib/admin-locale/sales-crm";
import { PLATFORM } from "@/lib/routes";

// Shared class tokens — same look as the existing platform/sales-demo screens (slate + blue, 44px touch targets).
export const inputCls = "min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-60";
export const labelCls = "grid min-w-0 gap-1.5 text-sm font-medium text-slate-700";
export const btnPrimary = "inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50";
export const btnSecondary = "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
export const btnDanger = "inline-flex min-h-11 items-center justify-center rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50";
export const cardCls = "min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <p className="font-medium text-slate-800">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** Rendered (not redirected) when a signed-in platform user lacks the capability for a page. */
export function PermissionDenied({ t }: { t: CrmCopy }) {
  return (
    <div role="alert" className="mx-auto max-w-lg rounded-xl border border-amber-300 bg-amber-50 p-6 text-center">
      <h1 className="text-lg font-semibold text-amber-900">{t.states.deniedTitle}</h1>
      <p className="mt-2 text-sm text-amber-900/80">{t.states.deniedBody}</p>
      <Link href={PLATFORM.sales} className={`${btnSecondary} mt-4`}>{t.states.backToDashboard}</Link>
    </div>
  );
}

export function NotFoundState({ t }: { t: CrmCopy }) {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-6 text-center">
      <h1 className="text-lg font-semibold text-slate-900">{t.states.notFoundTitle}</h1>
      <p className="mt-2 text-sm text-slate-600">{t.states.notFoundBody}</p>
      <Link href={PLATFORM.sales} className={`${btnSecondary} mt-4`}>{t.states.backToDashboard}</Link>
    </div>
  );
}

const STAGE_TONE: Record<string, string> = {
  NEW: "bg-slate-100 text-slate-700", CONTACTED: "bg-sky-100 text-sky-800", ENGAGED: "bg-cyan-100 text-cyan-800", QUALIFIED: "bg-indigo-100 text-indigo-800",
  DEMO_SCHEDULED: "bg-violet-100 text-violet-800", DEMO_COMPLETED: "bg-purple-100 text-purple-800", DECISION: "bg-amber-100 text-amber-800",
  WON: "bg-emerald-100 text-emerald-800", LOST: "bg-rose-100 text-rose-800", UNQUALIFIED: "bg-slate-200 text-slate-700", DO_NOT_CONTACT: "bg-red-100 text-red-800",
};
export function Badge({ children, tone = "bg-slate-100 text-slate-700" }: { children: ReactNode; tone?: string }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>{children}</span>;
}
export function StageBadge({ stage, t }: { stage: string; t: CrmCopy }) { return <Badge tone={STAGE_TONE[stage]}>{t.stages[stage] ?? stage}</Badge>; }
export function LanguageBadge({ language, t }: { language: string; t: CrmCopy }) {
  return <Badge tone={language === "UNKNOWN" ? "bg-amber-100 text-amber-800" : "bg-blue-50 text-blue-800"}>{t.languageShort[language] ?? language}</Badge>;
}

/** 0–100 score pill. null → "—" with the honest "not enough data" title. */
export function ScorePill({ value, overridden, label, t }: { value: number | null; overridden?: boolean; label: string; t: CrmCopy }) {
  const tone = value === null ? "bg-slate-100 text-slate-500" : value >= 70 ? "bg-emerald-100 text-emerald-800" : value >= 40 ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800";
  return (
    <span title={value === null ? t.scoring.insufficient : undefined} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      <span className="font-normal opacity-80">{label}</span> {value ?? "—"}{overridden && <span aria-label={t.scoring.overridden} title={t.scoring.overridden}>✎</span>}
    </span>
  );
}

export function Pager({ page, pages, hrefFor, t }: { page: number; pages: number; hrefFor: (page: number) => string; t: CrmCopy }) {
  if (pages <= 1) return null;
  return (
    <nav className="flex items-center justify-between gap-3" aria-label="pagination">
      {page > 1 ? <Link className={btnSecondary} href={hrefFor(page - 1)}>{t.common.previous}</Link> : <span />}
      <span className="text-sm text-slate-600">{t.common.page} {page} {t.common.of} {pages}</span>
      {page < pages ? <Link className={btnSecondary} href={hrefFor(page + 1)}>{t.common.next}</Link> : <span />}
    </nav>
  );
}

export function formatDate(value: Date | string | null | undefined, locale: "en" | "fr", withTime = false): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString(locale === "fr" ? "fr-CA" : "en-CA", withTime
    ? { dateStyle: "medium", timeStyle: "short", timeZone: "America/Toronto" } : { dateStyle: "medium", timeZone: "America/Toronto" });
}

export { crmCopy };
