import "server-only";
import { can, type PlatformSalesActor } from "@/domain/sales-crm/access";
import { addressFingerprint, decideLocation, geocodeQuery } from "@/domain/sales-crm/geocoding";
import { BATCH_MAX, TEST_BATCH_MAX, classifyForGeocoding, type QueueClass } from "@/domain/sales-crm/mapbox-geocoding";
import { db } from "@/lib/db";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { geocodingStatus, isProductionEnvironment, liveGeocoder, maxRequestsHardCap, type GeocodeProvider } from "@/lib/sales-crm/geocoder";
import { upsertLocation } from "@/lib/sales-crm/location-service";
import { CrmError } from "@/lib/sales-crm/prospects";

// Super Admin geocoding of EXISTING prospects. Every paid request is explicit (a button press), budget-guarded and idempotent:
//   · nothing runs at deploy time, on page load, or from a seller's browser;
//   · a prospect with a decisive stored answer for its CURRENT address is never requested again;
//   · requests are reserved in the database BEFORE the call, so a crash or a double click can never exceed the owner's ceiling;
//   · only ONE batch runs at a time (lease), so concurrent clicks cannot double-spend.
// CRM prospects are platform records (not tenant shop data); the sole authorization is the Super Admin `manage_geocoding` capability.

const SETTINGS_ID = "default";
const LEASE_MS = 2 * 60_000;
const REQUEST_TIMEOUT_MS = 8_000;
const SCAN_LIMIT = 5_000;
const REVIEW_LIST_LIMIT = 100;
const AUTO_RETRY_BACKOFF_MS = 60 * 60_000;
const SAMPLE_LIMIT = 10;

function requireSuperAdmin(actor: PlatformSalesActor) {
  if (!actor.all || !can(actor, "manage_geocoding")) throw new Error("SALES_FORBIDDEN");
}

export interface GeocodingSettingsView { enabled: boolean; maxRequests: number; requestsUsed: number; remaining: number; hardCap: number }

async function readSettings(): Promise<GeocodingSettingsView> {
  const row = await db.crmGeocodingSettings.findUnique({ where: { id: SETTINGS_ID } });
  const hardCap = maxRequestsHardCap();
  const maxRequests = Math.min(row?.maxRequests ?? 0, hardCap), used = row?.requestsUsed ?? 0;
  return { enabled: row?.enabled ?? false, maxRequests, requestsUsed: used, remaining: Math.max(0, maxRequests - used), hardCap };
}

export async function saveGeocodingSettings(actor: PlatformSalesActor, input: { enabled: boolean; maxRequests: number }) {
  requireSuperAdmin(actor);
  const hardCap = maxRequestsHardCap();
  if (typeof input.enabled !== "boolean" || !Number.isInteger(input.maxRequests) || input.maxRequests < 0 || input.maxRequests > hardCap) throw new CrmError("INVALID_BUDGET");
  const before = await readSettings();
  // A ceiling can never be lowered below what was already spent (the counter is a lifetime total).
  if (input.maxRequests < before.requestsUsed) throw new CrmError("INVALID_BUDGET");
  await db.crmGeocodingSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, enabled: input.enabled, maxRequests: input.maxRequests, updatedByUserId: actor.userId },
    update: { enabled: input.enabled, maxRequests: input.maxRequests, updatedByUserId: actor.userId },
  });
  await writeCrmAudit({ actorUserId: actor.userId, action: "GEOCODING_SETTINGS_CHANGED", entityType: "CrmGeocodingSettings", entityId: SETTINGS_ID,
    before: { enabled: before.enabled, maxRequests: before.maxRequests }, after: { enabled: input.enabled, maxRequests: input.maxRequests } });
  return readSettings();
}

const ELIGIBLE_WHERE = { status: "ACTIVE", doNotContact: false, mergedIntoId: null, archivedAt: null, assignedStaffId: { not: null } } as const;
const SELECT = { id: true, name: true, address: true, city: true, province: true, postalCode: true, location: true } as const;

interface Scanned { lastAttemptAt: Date | null; id: string; name: string; address: string | null; city: string | null; province: string | null; postalCode: string | null; cls: QueueClass; failureCode: string | null; attempts: number }

/** `only` narrows the scan to specific prospects (programmatic use and tests; the admin UI always works on the whole eligible book). */
async function scan(now: Date, only?: readonly string[]): Promise<Scanned[]> {
  const rows = await db.crmProspect.findMany({ where: only ? { ...ELIGIBLE_WHERE, id: { in: [...only] } } : ELIGIBLE_WHERE, select: SELECT, orderBy: { id: "asc" }, take: SCAN_LIMIT });
  const production = isProductionEnvironment();
  return rows.map((r) => ({
    lastAttemptAt: r.location?.lastAttemptAt ?? null, id: r.id, name: r.name, address: r.address, city: r.city, province: r.province, postalCode: r.postalCode,
    cls: classifyForGeocoding(r, r.location, now, { production }), failureCode: r.location?.failureCode ?? null, attempts: r.location?.attempts ?? 0,
  }));
}

export interface ReviewItem { id: string; name: string; address: string; reason: string; failureCode: string | null; attempts: number; retryable: boolean }
export interface GeocodingOverview {
  provider: { mode: string; reason: string; live: boolean };
  settings: GeocodingSettingsView;
  counts: { eligible: number; ready: number; toGeocode: number; errorRetry: number; review: number; incomplete: number };
  /** Paid requests a full batch run would spend (prospects needing a first/refreshed answer). Retries of failures are extra and explicit. */
  estimatedRequests: number;
  samples: { id: string; name: string; address: string }[];
  review: ReviewItem[];
  reviewTruncated: boolean;
}

const addr = (r: Scanned) => [r.address, r.city, r.province, r.postalCode].filter(Boolean).join(", ");

/** Read-only preview. Makes NO provider request and writes nothing. */
export async function getGeocodingOverview(actor: PlatformSalesActor, now = new Date(), only?: readonly string[]): Promise<GeocodingOverview> {
  requireSuperAdmin(actor);
  const [all, settings] = await Promise.all([scan(now, only), readSettings()]);
  const st = geocodingStatus();
  const by = (k: QueueClass["kind"]) => all.filter((r) => r.cls.kind === k);
  const toGeocode = by("TO_GEOCODE"), errorRetry = by("ERROR_RETRY");
  const review = all.filter((r) => r.cls.kind === "REVIEW" || r.cls.kind === "INCOMPLETE" || r.cls.kind === "ERROR_RETRY");
  const items: ReviewItem[] = review.map((r) => ({
    id: r.id, name: r.name, address: addr(r), failureCode: r.failureCode, attempts: r.attempts,
    reason: r.cls.kind === "REVIEW" ? r.cls.reason : r.cls.kind === "INCOMPLETE" ? r.cls.reason : "ERROR",
    retryable: r.cls.kind === "REVIEW" || r.cls.kind === "ERROR_RETRY",
  }));
  return {
    provider: { mode: st.mode, reason: st.reason, live: st.live }, settings,
    counts: { eligible: all.length, ready: by("READY").length, toGeocode: toGeocode.length, errorRetry: errorRetry.length, review: by("REVIEW").length, incomplete: by("INCOMPLETE").length },
    estimatedRequests: toGeocode.length,
    samples: toGeocode.slice(0, SAMPLE_LIMIT).map((r) => ({ id: r.id, name: r.name, address: addr(r) })),
    review: items.slice(0, REVIEW_LIST_LIMIT), reviewTruncated: items.length > REVIEW_LIST_LIMIT,
  };
}

export type BatchOutcome = "GEOCODED" | "AMBIGUOUS" | "INVALID" | "ERROR" | "SKIPPED_BUDGET" | "NOT_ELIGIBLE";
export interface BatchResult {
  mode: "TEST" | "BATCH" | "RETRY";
  attempted: number; geocoded: number; needsReview: number; failed: number;
  /** Why the run stopped early (provider rejected the credentials, rate-limited, or the budget ran out). */
  stoppedReason: "AUTH" | "RATE_LIMITED" | "BUDGET_EXHAUSTED" | null;
  settings: GeocodingSettingsView;
  items: { prospectId: string; outcome: BatchOutcome; failureCode: string | null }[];
}

/** Atomically spends one request of the budget. false = no budget left (or geocoding switched off) → the request MUST NOT be made. */
async function reserveRequest(cap: number): Promise<boolean> {
  const n = await db.$executeRaw`UPDATE "garageos"."CrmGeocodingSettings" SET "requestsUsed" = "requestsUsed" + 1, "updatedAt" = now() WHERE "id" = ${SETTINGS_ID} AND "enabled" = true AND "requestsUsed" < LEAST("maxRequests", ${cap}::int)`;
  return n === 1;
}

export interface RunOptions { /** Set only by the Lead Radar automation tick: failed lookups are retried after a back-off, bad credentials switch geocoding off, and an empty run writes no audit row. */ automatic?: boolean; mode: "TEST" | "BATCH" | "RETRY"; /** RETRY only: the review/failed prospects to re-request. */ prospectIds?: string[]; includeErrors?: boolean; /** Restrict the whole run to these prospects (programmatic/test use). */ only?: readonly string[] }

export async function runGeocodingBatch(actor: PlatformSalesActor, opts: RunOptions, now = new Date(), provider: GeocodeProvider | null = liveGeocoder()): Promise<BatchResult> {
  requireSuperAdmin(actor);
  if (!provider) throw new CrmError("GEOCODING_NOT_LIVE");
  const hardCap = maxRequestsHardCap();
  const settings0 = await readSettings();
  if (!settings0.enabled) throw new CrmError("GEOCODING_DISABLED");
  if (settings0.remaining <= 0) throw new CrmError("BUDGET_EXHAUSTED");

  // One batch at a time: take the lease or refuse.
  const leased = await db.crmGeocodingSettings.updateMany({ where: { id: SETTINGS_ID, OR: [{ runLeaseUntil: null }, { runLeaseUntil: { lt: now } }] }, data: { runLeaseUntil: new Date(now.getTime() + LEASE_MS) } });
  if (leased.count !== 1) throw new CrmError("RUN_IN_PROGRESS");

  const result: BatchResult = { mode: opts.mode, attempted: 0, geocoded: 0, needsReview: 0, failed: 0, stoppedReason: null, settings: settings0, items: [] };
  try {
    const all = await scan(now, opts.only);
    const byId = new Map(all.map((r) => [r.id, r]));
    let queue: Scanned[];
    if (opts.mode === "RETRY") {
      const ids = [...new Set(opts.prospectIds ?? [])].slice(0, BATCH_MAX);
      queue = [];
      for (const id of ids) {
        const r = byId.get(id);
        // Only failures/ambiguities can be retried; READY and INCOMPLETE rows never spend a request, unknown/ineligible ids are reported.
        if (r && (r.cls.kind === "REVIEW" || r.cls.kind === "ERROR_RETRY" || r.cls.kind === "TO_GEOCODE")) queue.push(r);
        else result.items.push({ prospectId: id, outcome: "NOT_ELIGIBLE", failureCode: null });
      }
    } else {
      // Automatic runs retry a transient failure (attempts < MAX) only after a back-off, so an outage cannot burn the budget every tick.
      const retryErrors = opts.automatic ? (r: Scanned) => !r.lastAttemptAt || now.getTime() - r.lastAttemptAt.getTime() >= AUTO_RETRY_BACKOFF_MS : () => opts.includeErrors === true;
      queue = all.filter((r) => r.cls.kind === "TO_GEOCODE" || (r.cls.kind === "ERROR_RETRY" && retryErrors(r)));
      queue = queue.slice(0, opts.mode === "TEST" ? TEST_BATCH_MAX : BATCH_MAX);
    }

    for (const p of queue) {
      const query = geocodeQuery(p);
      if (!query) { result.items.push({ prospectId: p.id, outcome: "NOT_ELIGIBLE", failureCode: null }); continue; }
      if (!(await reserveRequest(hardCap))) { result.stoppedReason = "BUDGET_EXHAUSTED"; result.items.push({ prospectId: p.id, outcome: "SKIPPED_BUDGET", failureCode: null }); break; }
      result.attempted++;
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
      let answer;
      try { answer = await provider.geocode(query, p, ctl.signal); }
      catch { answer = { kind: "ERROR", code: ctl.signal.aborted ? "TIMEOUT" : "PROVIDER_ERROR" } as const; }
      finally { clearTimeout(timer); }

      // Credentials rejected or rate-limited: stop the whole batch, store nothing for this prospect (it is retried later at no extra "attempt" cost).
      if (answer.kind === "ERROR" && (answer.code === "AUTH" || answer.code === "RATE_LIMITED")) {
        result.stoppedReason = answer.code; result.failed++;
        // Unattended runs fail closed: rejected credentials switch geocoding off (the owner re-enables it after fixing the token) instead of burning one request per tick.
        if (opts.automatic && answer.code === "AUTH") await db.crmGeocodingSettings.updateMany({ where: { id: SETTINGS_ID }, data: { enabled: false } });
        result.items.push({ prospectId: p.id, outcome: "ERROR", failureCode: answer.code });
        break;
      }
      const fp = addressFingerprint(p), d = decideLocation(answer);
      if (d.status === "GEOCODED") {
        await upsertLocation(p.id, { status: "GEOCODED", provider: provider.key, addressFingerprint: fp, latitude: d.lat, longitude: d.lng, accuracy: d.accuracy, confidence: d.confidence, geocodedAt: now, failureCode: null }, now);
        result.geocoded++; result.items.push({ prospectId: p.id, outcome: "GEOCODED", failureCode: null });
      } else {
        await upsertLocation(p.id, { status: d.status, provider: provider.key, addressFingerprint: fp, failureCode: d.failureCode }, now);
        if (d.status === "ERROR") result.failed++; else result.needsReview++;
        result.items.push({ prospectId: p.id, outcome: d.status, failureCode: d.failureCode });
      }
    }
  } finally {
    await db.crmGeocodingSettings.updateMany({ where: { id: SETTINGS_ID }, data: { runLeaseUntil: null } });
  }
  result.settings = await readSettings();
  if (opts.automatic && result.attempted === 0) return result; // nothing spent, nothing to report
  // Audit: counts only — never addresses, coordinates or the token.
  await writeCrmAudit({ actorUserId: actor.userId, action: "GEOCODING_BATCH_RUN", entityType: "CrmGeocodingSettings", entityId: SETTINGS_ID,
    metadata: { mode: opts.mode, ...(opts.automatic ? { automatic: true } : {}), attempted: result.attempted, geocoded: result.geocoded, needsReview: result.needsReview, failed: result.failed, stoppedReason: result.stoppedReason, requestsUsed: result.settings.requestsUsed, maxRequests: result.settings.maxRequests } });
  return result;
}

export interface AutoGeocodeTally { skipped?: "PROVIDER_NOT_LIVE" | "GEOCODING_DISABLED" | "BUDGET_EXHAUSTED" | "RUN_IN_PROGRESS" | "PAST_DEADLINE"; attempted?: number; geocoded?: number; needsReview?: number; failed?: number; stoppedReason?: BatchResult["stoppedReason"] }

/**
 * One bounded, unattended geocoding step for the Lead Radar tick. It can spend a paid request ONLY if all of these hold: Mapbox is fully configured
 * and switched on in the environment, the Super Admin enabled geocoding in the database, and the owner's request budget (≤ the hard cap) has room.
 * Today none of that is true, so this returns a "skipped" tally and touches nothing. Positions already known from the source never cost a request.
 */
export async function autoGeocodeStep(actor: PlatformSalesActor, deadline: number, now = new Date(), provider: GeocodeProvider | null = liveGeocoder()): Promise<AutoGeocodeTally> {
  if (!provider) return { skipped: "PROVIDER_NOT_LIVE" };
  const s = await readSettings();
  if (!s.enabled) return { skipped: "GEOCODING_DISABLED" };
  if (s.remaining <= 0) return { skipped: "BUDGET_EXHAUSTED" };
  if (Date.now() >= deadline) return { skipped: "PAST_DEADLINE" };
  try {
    const r = await runGeocodingBatch(actor, { mode: "BATCH", automatic: true }, now, provider);
    return { attempted: r.attempted, geocoded: r.geocoded, needsReview: r.needsReview, failed: r.failed, stoppedReason: r.stoppedReason };
  } catch (e) {
    if (e instanceof CrmError && (e.code === "RUN_IN_PROGRESS" || e.code === "BUDGET_EXHAUSTED" || e.code === "GEOCODING_DISABLED")) return { skipped: e.code === "GEOCODING_DISABLED" ? "GEOCODING_DISABLED" : e.code === "BUDGET_EXHAUSTED" ? "BUDGET_EXHAUSTED" : "RUN_IN_PROGRESS" };
    throw e;
  }
}
