# Sales CRM — Agent 1 handoff (foundation)

Branch `claude/optimistic-fermi-eh3m39` → PR to `main`. Baseline: `main` @ `729f14d` (docs-only master plan). Product spec: `docs/sales-crm-master-implementation-plan.md`.

**Recommendation: GO for merge to a Preview/Production deploy, with the conditions in §10** (additive migration; no messaging/calendar/Stripe changes). Not exercised against Production or Neon — see §8/§10.

## 1. What shipped
- **Platform sales authorization** (not a tenant role): `SALES_REP`, `SALES_MANAGER` via `PlatformSalesStaff`; Super Admin unchanged. Tenant `Role` enum untouched. Sales users are `User{role: VIEWER, shopId: null}` shells with no tenant powers.
- **Super Admin team management** (`/platform/sales/team`): invite (single-use hashed link, emailed if Resend is configured, otherwise shown once), edit profile/role/manager/territories/UI language/timezone, activate/deactivate (JWT revoked next request), resend access link (also password reset), bulk reassign open prospects + opportunities + tasks, per-seller summary, audit panel. Profile fields for Agent 2 stored but inert (§6).
- **CRM**: prospects (list: search/filter/sort/pagination; create/edit/archive/restore), multiple contacts (primary, decision maker, language override), FR/EN/UNKNOWN, source/industry/size/software/notes/tags, assignment, duplicate detection, persistent do-not-contact, safe CSV import (preview → confirm), detail page + timeline.
- **Prospect Intelligence**: DB-configurable needs taxonomy (9 seeded, Super Admin can retune/add at `/platform/sales/settings/needs`), severity/priority/confirmed-vs-inferred/evidence, explainable Fit and Buying Intent (separate), human overrides with reason, ranked "features to demo" from recorded needs only. No AI, nothing fabricated; missing data is excluded and lowers reported confidence.
- **Pipeline & activities**: `NEW→CONTACTED→ENGAGED→QUALIFIED→DEMO_SCHEDULED→DEMO_COMPLETED→DECISION`, terminals `WON/LOST/UNQUALIFIED/DO_NOT_CONTACT`; board + table; guarded stage changes with `CrmStageEvent` history; opportunity details; notes/calls/meetings/logged emails; follow-up tasks with due dates (assignee timezone), overdue badges; dashboard with real DB metrics.
- **Existing demos**: SalesDemo flow preserved; now scoped by seller; list moved to `/platform/sales/demos`; opportunity → demo link point added.
- **UI**: existing GarageOS look, EN/FR (`src/lib/admin-locale/sales-crm.ts`, parity tested), loading/empty/error/denied/not-found states, confirmations; verified no horizontal overflow at 390 / 820 / 1366 px (Playwright screenshots, dev server on local DB).

## 2. Models and migration
Migration `prisma/migrations/20261009100000_sales_crm_foundation` — **purely additive** (new enums/tables + one nullable column `SalesDemo.crmOpportunityId`; zero DROP/rewrites). Replayed from the full history on a scratch Postgres 16; `prisma migrate diff` afterwards = empty (no drift).

Tables: `PlatformSalesStaff`, `CrmProspect`, `CrmContact`, `CrmOpportunity`, `CrmStageEvent`, `CrmNeedDefinition` (seeded), `CrmProspectNeed`, `CrmActivity` (append-only), `CrmTask`, `CrmAuditEvent`, `CrmImportBatch`. DB-enforced invariants (raw SQL in migration): **one open opportunity per prospect** and **one active primary contact** (partial unique indexes); contact language override ≠ UNKNOWN; score ranges 0–100; MRR ≥ 0; meeting bounds; invite hash format; UI locale EN/FR; need weight 1–30. Indexes on assignee/status/dueAt/stage/normalized name/domain/phone.

## 3. Routes (all under `/platform/sales` unless noted)
`/` dashboard · `/prospects` · `/prospects/new` · `/prospects/import` · `/prospects/[id]` · `/prospects/[id]/edit` · `/pipeline` (`?view=table`) · `/tasks` · `/demos` (old list) · `/new`, `/[id]`, `/[id]/convert` (unchanged deep links; `/new?opportunity=<id>` prefills) · `/team` · `/team/new` · `/team/[staffId]` · `/settings/needs` · public `/sales-invite/[staffId]#token=…`.
Server actions (`src/actions/`): `sales-staff` (create/update/status/resend/reassign/accept-invite), `sales-prospects`, `sales-pipeline` (stage, new opp, details, score override, assign, `linkSalesDemoToOpportunity`), `sales-activities` (activity + task lifecycle), `sales-needs`, `sales-import`.

## 4. Authorization model
`src/domain/sales-crm/access.ts` (pure) + `src/lib/sales-crm/access.ts` (DB). Identity is always the **real user id from the DB of this environment**, never tenant claims, never impersonation.
- Capabilities: rep `read_assigned_prospects, manage_prospects, import_prospects, prepare_demo, send_sales_email*`; manager adds `read_team_prospects, reassign_prospects, view_team_reporting`; Super Admin all incl. `manage_team, manage_needs_taxonomy`, `view_all_reporting`, `manage_sequences*, manage_sender_identities*, manage_playbooks*` (*reserved for Agents 2/3, no behaviour in Agent 1).
- Scope: rep → own `assignedStaffId`; manager → self + direct reports + unassigned pool; Super Admin → all. Out-of-scope records return NOT_FOUND (no existence leak; duplicate hints are identity-free). `assignedScopeWhere(actor)` must be used for every query. Demos: `createdByUserId` within `scopeUserIds`.
- Helpers: `requireCrmActor(cap)` (actions; throws `SALES_FORBIDDEN`, `EXIT_DEMO_FIRST` during demo impersonation), `getCrmPageActor(cap)`/`loadCrmPage` (pages → `<PermissionDenied/>`), `resolvePlatformSalesActor(userId)`, existing `requireSalesActor()` (now staff-aware; `actor.platform` carries scope).
- `/platform/layout.tsx` admits Super Admin + active staff; every non-sales platform page (`/platform`, `shops/[id]`, `messages`, `analytics`) now calls `requireSuperAdmin()` itself. Pusher support channels stay Super Admin only (chrome no longer subscribes for sellers).
- `auth.ts`: non-ACTIVE staff (INVITED/INACTIVE) lose the session on the next JWT pass and cannot sign in; active staff may start demo impersonation (only via `requirePreparedDemo` ownership check); sellers land in `/platform/sales`.

## 5. Ownership rules
Prospect owner = `assignedStaffId` (mirrored on its open opportunity). Reps create/import only into their own book; managers assign within team; Super Admin anywhere. Only active staff can be assignees. Deactivation keeps every row; activities store the real `authorUserId` (FK RESTRICT) so attribution survives; archived prospects keep their historical owner on bulk reassign. Do-not-contact is sticky (survives archive/re-import) and only Super Admin can reinstate. `WON` can never be set by hand (reserved for Stripe-confirmed conversion, Agent 3).

## 6. Contracts for Agents 2 and 3
- **Staff profile** (Agent 2): `PlatformSalesStaff.{id,userId,status,role,displayName,signatureText,uiLocale,timezone,bookingSlug,bookingEnabled,defaultMeetingMinutes,meetingBufferMinutes,availability(json)}`. Agent 2 must check `status === ACTIVE` (via `resolvePlatformSalesActor`) before any send/booking; deactivation already sets `bookingEnabled=false`. Sender identities/threads/meetings should FK `staffId`, `prospectId`, `contactId`, `opportunityId` (all stable cuid strings).
- **Language**: `resolveEffectiveLanguage({override, contact, prospect})` in `src/domain/sales-crm/language.ts`; `UNKNOWN` ⇒ `needsHumanDecision`. Snapshot the result per message/meeting.
- **Suppression**: `CrmProspect.doNotContact` / `CrmContact.doNotContact` are authoritative opt-outs; check before every send. Agent 2 owns richer suppression/CASL records.
- **Timeline**: append `CrmActivity` rows (`EMAIL_LOGGED` today is manual; add enum values with `ALTER TYPE … ADD VALUE`). Use `writeCrmAudit`.
- **CSV safety**: any export must use `csvCell`/`toCsv` (`src/domain/sales-crm/csv.ts`).
- **Demo** (Agent 3): `SalesDemo.crmOpportunityId`, `linkSalesDemoToOpportunity(demoId, oppId)`, `getDemoPlanningContext(actor, oppId)` → needs, ranked `recommendedFeatures` (stable keys `booking, invoices, work-orders, dvi, communications, reminders, inventory, reports, multi-location`), effective language, contacts. `CrmOpportunity.{wonAt,convertedShopId,estimatedMrrCents,estimatedPlan}` are the conversion write-targets; stage history is in `CrmStageEvent`. Stage is never changed by demo events here.
- **Files Agents 2/3 will collide on**: `schema.prisma`, `routes.ts`, `AdminSidebar.tsx` (`navFor`), `sales-crm.ts` copy, `access.ts` capability matrix.

## 7. Tests (actual results, this branch)
| Command | Result |
|---|---|
| `npm test` | **646 pass, 0 fail, 1 skipped** (skipped = DB suite without env). Baseline before work: 621 pass. |
| `GARAGEOS_CRM_TEST_DB_URL=postgresql://postgres@127.0.0.1:54329/garageos_replay npx tsx --test tests/sales-crm-db.test.ts` | **9/9 pass**, re-run 3× (real Postgres 16 with all migrations: scope isolation, invites, 1,200-row import, CAS races, partial unique indexes, DNC cascade, deactivation/reassignment/attribution, demo ownership). Refuses any non-local DB or name without `replay|test|scratch`. |
| `npx tsc --noEmit` | clean |
| `npx eslint src` | 0 errors, 51 warnings (identical to baseline) |
| `npx prisma validate` | valid |
| `npx next build` (no DB env; migration step bypassed) | success |
Added: `tests/sales-crm-domain.test.ts` (16), `sales-crm-authz.test.ts` (9), `sales-crm-db.test.ts` (9); `tests/helpers/action-harness.ts` now defaults `platformSalesStaff` lookups to "none"; `auth-claims` test patches that lookup. **Not run**: the repo's Neon integration suite (`npm run test:integration`, needs the authorized target), and real email/Stripe paths.

## 8. Security findings / review notes
- Tenant role never grants sales access; spoofed `SUPER_ADMIN` session claims rejected (DB decides). Cross-seller reads/writes return NOT_FOUND; verified in DB tests.
- Invites: 256-bit token, SHA-256 at rest, single use (CAS), 7-day expiry, fragment-carried (stripped from URL), rate-limited per IP/staff, generic failure. If email is unavailable the link is shown once to the Super Admin (honest, never stored).
- Import: 2 MB / 2,000-row caps, utf-8 → cp1252 fallback, formula neutralisation (names/titles at rest), phone/website validation, error report contains codes only, stored rows (PII) purged after import/cancel/24 h, atomic transaction, CAS idempotency.
- Audit: every staff/prospect/stage/assignment/score/task/import change writes `CrmAuditEvent` (field names/ids only, no notes/contact data); staff lifecycle also writes `PlatformAuditLog`.
- Residual: long free-text notes are not neutralised at rest (defence applies on export via `csvCell`). In-memory-less rate limiting fails open on DB errors (existing repo behaviour). Password policy for invitees is ≥10 chars (no breach check). Fit-score sorting is not offered (list sorts: name/created/activity).

## 9. Environment / configuration
No new variables. Invite email uses existing `RESEND_API_KEY` + `EMAIL_FROM_PLATFORM`/`EMAIL_FROM` (without them, manual link). `NEXT_PUBLIC_APP_URL`/`NEXTAUTH_URL` build the invite URL.

## 10. Known limitations, deploy and migration risks
- Out of scope by design: email/inbox/sequences/calendar/booking (Agent 2); playbooks/academy/Stripe-confirmed Won/advanced reports (Agent 3). Staff signature/availability/booking fields are stored only. "Email (logged)" is a manual record, not real email.
- Dashboard metrics are operational counts; no funnel conversion rates or MRR attribution yet.
- Board shows up to 700 open opportunities (40 per column rendered; table shows all 700); no drag-and-drop (select-based move, accessible).
- Migration is additive; `npm run build` applies it on Vercel Production only (guard unchanged). New timestamp is later than the newest existing migration. Rollback: new tables/enums can be dropped and `SalesDemo.crmOpportunityId` removed; no existing data is modified. Deploying the code before the migration would error on new pages only — deploy runs the migration first.
- Behavioural change to existing code: `/platform/sales` is now the CRM dashboard (demo list is `/platform/sales/demos`); sellers' demo access is ownership-scoped (Super Admin unchanged); `SalesDemo` creation accepts optional `opportunityId`.
- Seeding: no sales users exist until a Super Admin creates them; Production DB was not touched by this work.
- Recommended before relying on it in Production: smoke-test on a Preview with a real Resend key (invite email) and create one rep + one manager end to end.
