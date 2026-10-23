// Client-side CTA click logic (Analytics v2), written as PURE functions so it is testable without a DOM.
// The listener component (src/components/analytics/CtaClickListener.tsx) only wires these to `document` and `navigator.sendBeacon`.
//
// Hard rules (contract §10.6): never preventDefault / await / delay a click, no retries, no cookies or storage, no form data,
// pathname only (never a query string or fragment), a CTA id outside the allowlist is ignored, private/untrackable paths are ignored.
import { isCtaId, type CtaId } from "@/lib/analytics/contract";
import { isTrackablePath } from "@/lib/privacy/private-paths";
import { isFrenchPath } from "@/lib/seo/routes";

export const CTA_EVENT_ENDPOINT = "/api/track/event";

/** Plan cards on the pricing page, in display order (CORE, PRO, COMPLETE). Typed as CtaId so an invalid id cannot compile. */
export const PLAN_CTA_IDS: readonly CtaId[] = ["plan_select_core", "plan_select_pro", "plan_select_complete"];

/** The minimal element shape needed to find a `data-cta` ancestor (a real DOM Element satisfies it). */
export interface CtaNodeLike {
  getAttribute?: (name: string) => string | null;
  parentElement?: CtaNodeLike | null;
}

const MAX_DEPTH = 8;

/** Walks from the clicked node up to a few ancestors and returns the first valid `data-cta` id, or null. */
export function findCtaId(start: CtaNodeLike | null | undefined): CtaId | null {
  let node: CtaNodeLike | null | undefined = start;
  for (let i = 0; node && i < MAX_DEPTH; i++) {
    const raw = typeof node.getAttribute === "function" ? node.getAttribute("data-cta") : null;
    if (raw !== null && raw !== undefined) return isCtaId(raw) ? raw : null;
    node = node.parentElement;
  }
  return null;
}

/** Pathname only: anything after `?` or `#` is cut defensively even though `location.pathname` never has them. */
export function pathnameOnly(pathname: string): string {
  return pathname.split(/[?#]/)[0];
}

export interface CtaEventBody {
  ctaId: CtaId;
  path: string;
  locale: "en" | "fr";
}

/** The exact body that may be sent, or null when the path is private/untrackable. Contains nothing else. */
export function buildCtaBody(ctaId: CtaId, pathname: string): CtaEventBody | null {
  const path = pathnameOnly(pathname);
  if (!path.startsWith("/") || !isTrackablePath(path)) return null;
  return { ctaId, path, locale: isFrenchPath(path) ? "fr" : "en" };
}

/** True when the browser asks not to be tracked (the server checks the headers as well). */
export function clientOptedOut(nav: { doNotTrack?: string | null; globalPrivacyControl?: boolean } | undefined): boolean {
  return Boolean(nav && (nav.doNotTrack === "1" || nav.globalPrivacyControl === true));
}

export interface CtaClickDeps {
  pathname: string;
  /** Keys already sent during this page view; the caller clears it when the path changes. */
  seen: Set<string>;
  /** Fire-and-forget transport. May throw; the handler swallows it. */
  send: (body: CtaEventBody) => void;
  optedOut?: boolean;
}

/**
 * Handles one click. Returns true when an event was handed to `send`. It takes only the click target (never the event object), so it
 * cannot call preventDefault, and it is synchronous, so it cannot delay navigation. At most one send per (ctaId, path) per page view.
 */
export function handleCtaClick(target: CtaNodeLike | null | undefined, deps: CtaClickDeps): boolean {
  try {
    if (deps.optedOut) return false;
    const ctaId = findCtaId(target);
    if (!ctaId) return false;
    const body = buildCtaBody(ctaId, deps.pathname);
    if (!body) return false;
    const key = `${body.ctaId}|${body.path}`;
    if (deps.seen.has(key)) return false;
    deps.seen.add(key);
    deps.send(body);
    return true;
  } catch {
    return false; // tracking must never affect the page
  }
}

/** Real transport: sendBeacon, falling back to a keepalive fetch whose result is ignored. No retries. */
export function sendCtaBeacon(body: CtaEventBody): void {
  try {
    const json = JSON.stringify(body);
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(CTA_EVENT_ENDPOINT, new Blob([json], { type: "application/json" }));
      return;
    }
    void fetch(CTA_EVENT_ENDPOINT, { method: "POST", body: json, headers: { "Content-Type": "application/json" }, keepalive: true, credentials: "omit" }).catch(() => undefined);
  } catch {
    /* ignore */
  }
}
