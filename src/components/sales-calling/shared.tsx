"use client";

import { useId, useSyncExternalStore, type ReactNode } from "react";
import type { CallingCopy } from "@/lib/admin-locale/sales-calling";
import { crmCopy, crmError } from "@/lib/admin-locale/sales-crm";
import { DEFAULT_MODE, readMode, writeMode, type DisplayMode } from "./softphone-model";
import { commsCopy } from "@/lib/admin-locale/sales-comms";

export type Locale = "en" | "fr";
export type Toast = { kind: "ok" | "error"; text: string } | null;

/** "{name}" placeholder substitution. */
export const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

export function fmtDateTime(iso: string | null | undefined, locale: Locale, timeZone: string, withTime = true): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(locale === "fr" ? "fr-CA" : "en-CA", withTime ? { dateStyle: "medium", timeStyle: "short", timeZone } : { dateStyle: "medium", timeZone });
  } catch {
    return new Date(iso).toLocaleString(locale === "fr" ? "fr-CA" : "en-CA");
  }
}

/** Localized message for any workspace / CRM / comms error code. Never shows a raw code. */
export function wsError(c: CallingCopy, locale: Locale, code: string | undefined | null): string {
  const k = code ?? "";
  if (c.ws.errors[k]) return c.ws.errors[k];
  if ((c.errors as Record<string, string>)[k]) return (c.errors as Record<string, string>)[k];
  const comms = commsCopy(locale).errors[k];
  if (comms) return comms;
  return crmError(crmCopy(locale), k);
}

// ---- Live-notes draft store: localStorage when available, in-memory otherwise; every access is guarded. ----
const NOTES_PREFIX = "garageos.calling.notes.";
const memory = new Map<string, string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function readNotes(pid: string): string {
  if (memory.has(pid)) return memory.get(pid)!;
  let v = "";
  try { v = localStorage.getItem(NOTES_PREFIX + pid) ?? ""; } catch { v = ""; }
  memory.set(pid, v);
  return v;
}
export function writeNotes(pid: string, text: string) {
  memory.set(pid, text);
  try { if (text) localStorage.setItem(NOTES_PREFIX + pid, text); else localStorage.removeItem(NOTES_PREFIX + pid); } catch { /* storage unavailable: kept in memory */ }
  emit();
}
export const clearNotes = (pid: string) => writeNotes(pid, "");
const subscribe = (l: () => void) => {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => { if (e.key?.startsWith(NOTES_PREFIX)) { memory.delete(e.key.slice(NOTES_PREFIX.length)); l(); } };
  try { window.addEventListener("storage", onStorage); } catch { /* no window */ }
  return () => { listeners.delete(l); try { window.removeEventListener("storage", onStorage); } catch { /* no window */ } };
};
/** The live-notes draft of one prospect ("" on the server and while no prospect is loaded). */
export function useLiveNotes(pid: string | null): string {
  return useSyncExternalStore(subscribe, () => (pid ? readNotes(pid) : ""), () => "");
}

// ---- Softphone display-mode preference (the ONLY softphone setting persisted). Guarded storage, in-memory fallback. ----
let memMode: DisplayMode | null = null;
const modeListeners = new Set<() => void>();
const safeStorage = (): Storage | null => { try { return window.localStorage; } catch { return null; } };
const modeSnapshot = (): DisplayMode => memMode ?? (memMode = readMode(safeStorage()));
const modeSubscribe = (l: () => void) => { modeListeners.add(l); return () => { modeListeners.delete(l); }; };
export function setPreferredMode(m: DisplayMode) { memMode = m; writeMode(safeStorage(), m); modeListeners.forEach((l) => l()); }
/** Preferred softphone display mode; the server render (and the first hydration pass) uses the default. */
export function usePreferredMode(): DisplayMode {
  return useSyncExternalStore(modeSubscribe, modeSnapshot, () => DEFAULT_MODE);
}

export function ToastView({ toast, onClose, closeLabel }: { toast: Toast; onClose: () => void; closeLabel: string }) {
  if (!toast) return null;
  return (
    <div role={toast.kind === "error" ? "alert" : "status"} className={`flex items-start justify-between gap-2 rounded-lg px-3 py-2 text-sm ${toast.kind === "error" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>
      <p className="min-w-0 break-words"><span aria-hidden="true">{toast.kind === "error" ? "⚠ " : "✓ "}</span>{toast.text}</p>
      <button type="button" onClick={onClose} aria-label={closeLabel} className="-my-1 inline-flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-md hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-blue-300">×</button>
    </div>
  );
}

/** A button that, when unavailable, stays visible but disabled and explains why (tooltip + screen-reader text). */
export function ActionButton({ label, onClick, disabledReason, className, busy }: { label: string; onClick: () => void; disabledReason?: string | null; className: string; busy?: boolean }) {
  const id = useId();
  const off = !!disabledReason || !!busy;
  return (
    <span title={disabledReason ?? undefined} className="block min-w-0">
      <button type="button" className={`${className} w-full`} disabled={off} onClick={onClick} aria-describedby={disabledReason ? id : undefined}>{label}</button>
      {disabledReason && <span id={id} className="sr-only">{disabledReason}</span>}
    </span>
  );
}

export function Panel({ id, title, children, actions, className = "" }: { id: string; title: string; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={`min-w-0 rounded-xl border border-slate-200 bg-white p-4 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="text-base font-semibold text-slate-900">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
