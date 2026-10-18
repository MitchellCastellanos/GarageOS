# GarageOS — Hybrid FIELD + Automated REMOTE acquisition engine: architecture audit & implementation plan (v2)

Date 2026-10-17 · `main` @ `970da7e` (#157) · Audit/design only: no code, no PR, no production access, no switch/secret changes, no sending, no enrollment, national rollout untouched.

**Evidence legend.** **[V]** verified by reading code (file:line, `main`). **[D]** repo docs only. **[P]** production fact (from the brief) or something only production can show — *not verified by me*. "Missing" was searched (grep over `src/ prisma/ .github/ scripts/ tests/`) before being claimed. Nothing here is legal advice; CASL items are product controls for counsel to confirm.

---

## Status and approved amendments (owner review, 2026-10-17) — **these supersede conflicting text below**

This document is the permanent record of the v2 audit and the dependency-ordered roadmap. The owner approved the direction with these adjustments:

1. **Approved:** hybrid FIELD + automated REMOTE model, one unified seller workspace, and keeping existing REMOTE ownership records while filtering them out of actionable FIELD/seller work views.
2. **Approved:** separating *campaign sender identity*, *automation ownership* and *human case ownership*. **Do not hardcode a central "GarageOS Sales Team" sender.** Support the existing authorized corporate seller identities; central/pooled sending is a *configurable* later option (supersedes §2 "Sender persona" and D-1).
3. **Approved:** reply-to-book as the initial CTA; pooled booking later (D-2).
4. **CASL (supersedes §8 tiers/sampling and D-5):** there is **no blanket "Tier A" approval and no 5 % sampling rule as sufficient compliance.** Evidence and legal basis stay attributable to **each recipient**. Any bulk workflow must preserve per-recipient evidence, auditable human decisions and the applicable approved compliance policy. Evidence "quality tiers" are only a *prioritisation/triage aid* for reviewers, never an approval shortcut. Sampling may at most be an additional quality-control signal, not a substitute for the policy. Unresolved legal questions are listed in *Counsel questions* below.
5. **Out-of-office (supersedes §6.2 AUTO_REPLY row and D-7):** no universal seven-business-day pause. Handling is conservative and **configurable**, based on message classification and a parsed return date when present; anything unparsed/unclear stops sending and goes to review. Defaults to be set by the owner with counsel.
6. **Capacity (supersedes §9 formula):** capacity must count **all outbound messages** — first touches, scheduled follow-ups, manual and transactional where they share the constraint — across **identity, sending domain and provider** limits, and the new-enrollment budget is what remains after forecast follow-ups.
7. **Preserved unchanged:** current sending switches, caps, the national rollout and suppression safeguards. **No production outreach activation.**
8. **Implementation authorization:** PR-2 only (separate FIELD and REMOTE work views). No other block starts before the PR-2 outcome is reviewed.

### Counsel questions (unresolved — do not treat any answer here as legal advice)
- What evidence does the approved policy require to rely on conspicuous publication for a given recipient, and may machine-collected evidence be reviewed in batches while each recipient keeps individual evidence and decision?
- Required independence of the reviewer, and whether one person with two accounts satisfies it.
- Whether role mailboxes (info@) satisfy the "relevant to the recipient's business role" condition.
- Validity period / re-verification cadence for published-address implied consent; handling when a restriction appears later.
- Treatment of express-consent and existing-business-relationship claims for cold prospects; whether `EXEMPT` has any automated use.
- Retention of evidence artifacts; Québec language requirements for the first message; sender identification when mail is sent on behalf of a seller.
- Handling of automated replies (out-of-office) and of negative replies that are not explicit unsubscribes.

### Implementation status
| Block | Status |
|---|---|
| PR-0 docs | This file |
| **PR-2 workspace separation** | **Implemented — in review.** View-layer only: no schema change, no ownership change, no sending/CASL/rollout change. See *PR-2 as built* below |
| **PR-1 compliance primitives** | **Implemented — in review** (not merged without owner approval). See *PR-1 as built* below |
| PR-3 … PR-10 | Not started; each needs a review of the previous outcome |

---

## 0. What changed from v1

| v1 assumed | v2 (final model) | Consequence |
|---|---|---|
| Seller owns each REMOTE prospect and sends from own identity | **Three separate ownerships**: sender identity ≠ automation ≠ human case | Biggest redesign: today `assignedStaffId` is simultaneously territory owner, sender, workload unit, visibility scope, planner input and task assignee (see §2) |
| Pilot/enrollment is a seller activity | Enrollment is **system work**; sellers only get actionable replies | Needs triage state, case routing, backpressure — none exist |
| "More mailboxes ⇒ more capacity" (v1 App. 3) | **Wrong.** Identities are From-addresses on a domain (Resend); reputation and provider quota are per domain/plan | Capacity must be governed per **sending domain + global**, not per identity [V `policy.ts:64`] |
| "Auto-suppress on opt-out phrase" (v1 G-19) | **Unsafe as written**: `looksLikeOptOut` matches *our own quoted footer* ("unsubscribe") and negations ("don't stop emailing me") [V `email.ts:120`] | Auto-suppress only after quote-stripping + negation + intent-word guards; otherwise stop + route to review |
| Review all PENDING contacts | Review only what sender capacity can use soon; machine-prepared evidence, human decision on cohorts | Unchanged in spirit; evidence tiers added (§8) |

Still valid from v1 (IDs preserved in §4): G-01…G-27. New findings are **N-01…N-16**.

---

## 1. Verdict and the hidden blockers to fix first

The upstream half (discover → classify → dedupe → import → assign → seed) is solid. The model you described **cannot be switched on by adding enrollment**: four structural couplings make it unsafe or impossible today.

| # | Hidden blocker | Evidence |
|---|---|---|
| **H1** | **The Field Planner and map treat *every* prospect assigned to a FIELD-mode seller as a field candidate — no territory filter.** The rollout assigns thousands of national REMOTE prospects to the founder's FIELD+REMOTE rep account; they flood route candidates (`take 400`) and the map book (`take 30000`). Route stops are only checked for ownership/DNC/fit/coverage. | `field-route-service.ts:49`, `field-map-service.ts:42,143`, `field-route.ts:40-48` (`stopBlock` has no territory test). [P] depends on that account being FIELD mode — the handoff says it is (§4 step 3). |
| **H2** | **A seller's "Mine", dashboard, stale count and pipeline board include every owned REMOTE prospect/opportunity in stage NEW.** With ~thousands assigned, the founder sees thousands of "open" and "stale" items. | `queues.ts:61` (`mine`), `queries.ts:13,162-185` (`OPEN` includes NEW; `stale` = open opps with no activity 14 d), `pipelineBoard queries.ts:116` |
| **H3** | **Sender = owner.** Enrollment requires `assignedStaffId` (`NO_OWNER`), sets `enrollment.staffId = owner`, and sends from the *owner's* identity; one identity per staff row; "nobody sends as somebody else, no fallback sender". A central/pooled sender is impossible without a change. | `sequences.ts:110,118,137`, `schema.prisma:3099` (`staffId @unique`), `compose.ts:36-41`, `outreach.ts:13,49` |
| **H4** | **Booking is bound to one seller's calendar.** Templates carry `{{booking.link}}`; eligibility requires `seller.bookingEnabled`; link kinds are only GENERAL/PROSPECT, both with a `staffId`. A campaign sender has no calendar; a pooled "first available human" link does not exist. | `booking-links.ts:8-25`, `public-booking.ts:37-110`, `schema.prisma:3041`, `outreach.ts:49`, `templates.ts:37,47,56…` |
| **H5** | **No triage state, no classification, no case primitive.** A non-automated reply only stops the enrollment, sets `needsReply`, writes an activity and pings **the original identity's** user. No class, no task, no stage move, no owner routing. After `reassignThread`, the realtime signal still goes to the old identity's user and the new owner replies from *their* identity. | `inbound.ts:114-151`, `schema.prisma:3148-3185`, `sales-inbox.ts:169-183` |
| **H6** | **Capacity is per identity, blind to follow-ups.** The cap is `min(identity.dailyLimit, settings.defaultDailyLimit)`; there is no domain/global cap or ramp; the pilot's "daily cap" counts *enrollments in 24 h*, not sends, and ignores follow-ups already scheduled → a deferral snowball. Cron is weekdays only; dispatch 25/run, sequences 50/run. | `policy.ts:64`, `automation.ts:257-290`, `cron/sales/route.ts:25-26`, `sales-cron.yml` |
| **H7** | **Lifecycle contradictions.** Rollout *ends with master OFF* and halts if pilot or both sending flags are ON; eligibility/pilot/release are skipped while `rolloutEnabled`; seeding shares the master switch. Campaigns cannot coexist with the rollout, and the end of the rollout stops the whole pipeline. | `rollout.ts:168`, `rollout.ts (domain) safetyViolation`, `automation.ts:356-360`, `contact-readiness.ts:86` |
| **H8** | **Opt-out detection is unusable for automation as-is** (quoted footer and negation false positives) and used only as a UI banner. | `email.ts:120-124`, `inbox/[threadId]/page.tsx:33` |

Everything else in §4 is real but subordinate to these.

---

## 2. Ownership model: three concepts, mapped onto existing data

| Concept | Meaning | Today's data (overloaded) | Target (reuse + additive) |
|---|---|---|---|
| **A. Campaign / sender identity** | Authorized From-address(es) | `CrmSenderIdentity` ↔ one `PlatformSalesStaff` (unique) | Same table. Add `PlatformSalesStaff.isCampaignSender` (non-human "GarageOS Sales" staff row, no login, excluded from every human pool/dashboard/assignment). Sender chosen by the campaign, **not** by prospect owner |
| **B. Automation ownership** | System prospects, schedules, follows up, closes quietly | implicit: `assignedStaffId` + `CrmSequenceEnrollment.staffId` | `CrmSequenceEnrollment` + `CrmOutreachEligibility` + lane (`assignmentMode=REMOTE ∧ territoryState=NATIONAL`). **No seller-visible work item exists for it.** `assignedStaffId` on REMOTE prospects becomes *attribution only* (existing values preserved, never moved in bulk) |
| **C. Human case ownership** | A person owns a conversation/deal | `assignedStaffId` (prospect+opp), `thread.ownerStaffId`, task assignee — set independently | One **case** = open opportunity ≥ `ENGAGED` + `thread.triage=HUMAN_OWNED` + one open `REPLY` task, all with the **same owner**, created idempotently by a router (§7) |

Rule: a REMOTE prospect becomes human work **only** by an event (actionable reply, meeting booked, trial question), never by import/assignment/enrollment. FIELD prospects become work only through the field workflow (route, visit outcome, task).

**Sender persona — SUPERSEDED (see amendments: no hardcoded central sender; existing seller identities, central/pooled configurable).** Original recommendation: a team identity ("GarageOS Sales Team") for automated mail (honest sender ID, simplest compatible: no seller approves anything, no seller is blamed for replies). The first human reply states who is taking over and is sent from that person's own identity (existing rule kept). Decision D-1.

---

## 3. Deliverable 1 — Current-state vs target-state architecture

```
CURRENT (v1 map, abridged)                         TARGET
 discover→classify→dedupe→import→assign(owner)     discover→classify→dedupe→import  (unchanged, rollout untouched)
   →seed PENDING contacts                              ├─ FIELD lane  : territory assign → route planner → visit → tasks   (unchanged; planner filtered to LOCAL)
   →[no UI] accept → hand-typed CASL → approve         └─ REMOTE lane : needs usable email, else deferred (call lane = decision)
   →eligibility (off during rollout)                              ↓
   →pilot enroll (owner's identity, owner's cap)       enrich: MX · website evidence artifact · language evidence · priority score
   →send                                                         ↓
   →reply: stop sequence, needsReply (owner inbox)      cohort review (machine-prepared; human decides; sample QA; independence enforced)
   →manual everything after                                      ↓
                                                        eligibility (always on, read-only, contact-bearing only)
                                                                 ↓
                                                        CAMPAIGN GOVERNOR (switch-gated, authorized): capacity − forecast follow-ups − case backpressure
                                                                 ↓ enroll → schedule → send  (sender = campaign identity pool; per-domain ramp; breaker)
                                                                 ↓
                                              inbound ─► TRIAGE (rules): opt-out→suppress · bounce/DSN · OOO→pause · negative→close · interested/question/meeting→CASE · ambiguous→REVIEW
                                                                 ↓ actionable only
                                                        ROUTER → one human case (owner, task, thread, opp) → SLA/escalation → manager rebalance
                                                                 ↓
                                              meeting (pooled booking) → demo → trial (ref token) → paid (Stripe event) → WON + MRR + attribution
                                                        SELLER WORKSPACE: My field visits · My remote replies · My meetings · My tasks · My opportunities
                                                        MANAGER OPS: both channels · throughput · queues · workload · conversion · alerts
```

---

## 4. Deliverable 2 — Stage audit A–K and updated gap matrix

Status: **I** implemented · **P** partial · **M** missing. "Safe to automate" = system may do it; "Human" = must remain human.

### 4.1 Stage audit

| Stage | Status | Reuse (code) | Safe to automate | Must stay human | Upstream → downstream |
|---|---|---|---|---|---|
| **A. Discovery & import** | **I** (REMOTE needs usable email; FIELD doesn't) | `worker.py`, `lead-radar-extract.yml`, `automation.ts:127 importStage`, `remote-email.ts` | All | Policy activation; HUMAN_REVIEW cohorts; ICP overrides | → qualify/dedupe → import → seed. Ends at rollout completion (H7) |
| **B. CASL evidence & approval prep** | **M** for prep; **I** for storage/approval | `casl-evidence.ts`, `sales-casl.ts` (row-lock, CAS, audit), `CrmSendingBasis`, `CrmDiscoveredContact` | Fetch/hash source page, detect restriction language, role/mailbox/MX facts, tiering, revocation on change | Every approval; counsel on rules; any express-consent claim | seed → accept → basis → eligibility |
| **C. Eligibility & continuous enrollment** | **P**: engine read-only & correct; stage off in rollout; enrollment owner-bound; caps wrong unit | `outreach.ts`, `eligibility.ts`, `automation.ts:257 pilotStage`, `sequences.ts enrollCore` | Eligibility always; enrollment within governor | Turning campaigns/switches on; caps | basis+language+sender → enroll → schedule |
| **D. Sequence scheduling & follow-ups** | **I** (idempotent, windows, stop rules); **P** for closeout | `sequences.ts processDueEnrollments`, `decideStop`, templates EN/FR | All, incl. quiet closeout and paused-sweep | Sequence activation & template approval | `COMPLETED` is set when last step is *queued* (`sequences.ts:276`) — no quiet period |
| **E. Inbound classification & suppression** | **P**: ingest/threading/stop good; classification **M** | `inbound.ts`, `isAutomatedMessage email.ts:107`, `suppressEmail` | Opt-out (guarded), bounce, OOO, negative (high-confidence), unsubscribe link/one-click | Ambiguous, interested/question handling | inbound → triage → case |
| **F. Human-only actionable queue** | **M** | `CrmTask` (types FOLLOW_UP/CALL/EMAIL/DEMO_PREP/OTHER), inbox views | Creation, prioritisation, dedupe | Working the case | triage → router |
| **G. Unified FIELD+REMOTE workspace** | **P**: FIELD pieces exist; REMOTE pollutes them (H1/H2) | `queues.ts`, `queries.ts`, `field-*.ts`, `platform-nav.ts` | Views/filters | — | needs F |
| **H. Routing & workload** | **M** (manual `reassignThread`/`assignProspect` only; `loadSellers` counts prospects not cases) | `sales-pipeline.ts:116 assignProspect`, `sales-inbox.ts:169`, `evaluateAcquisition territory.ts:126` | Route, escalate, backpressure | Manager rebalance decisions, capacity changes | triage → case → meeting |
| **I. Meeting→trial→paid→WON** | **P**: meetings & SalesDemo yes; stage/WON/attribution **M** | `meetings.ts`, `stripe-sync.ts:130`, `sales-demo-finalize.ts` | Stage events, link, WON from Stripe | Demo, closing | case → meeting → trial → paid |
| **J. Monitoring & backpressure** | **P**: dashboards; **M** alerts, heartbeat, governor | `CrmLeadAutomationRun`, `/national`, `/lead-radar/automation` | All detection | Responding | all |
| **K. Switches & lifecycle** | **P**: 12 controls, contradictions (H7) | `automation.ts`, `rollout.ts`, `CrmCommsSettings` | Display effective state | Every enable | all |

### 4.2 Gap matrix (severity: **P0** blocks first controlled pilot · **HIGH** blocks automated scale · **MED** · **LOW**)

| ID | Gap | Code reference | Sev | Fix (block) |
|---|---|---|---|---|
| H1/N-01 | Field planner/map include national REMOTE prospects | `field-route-service.ts:49`, `field-map-service.ts:42,143` | **P0** (live exposure [P]) | Territory = LOCAL + `assignmentMode ≠ REMOTE` in planner/map/`stopBlock` (PR-2) |
| H2/N-02 | Mine/dashboard/stale/pipeline polluted by REMOTE NEW | `queues.ts:61`, `queries.ts:13,162,116` | **P0** | Lane-aware queries (PR-2) |
| H3/N-03 | Sender = owner; one identity/staff; NO_OWNER | `sequences.ts:110,118,137`, `schema.prisma:3099` | HIGH | Campaign sender pool (PR-3) |
| H4/N-04 | No pooled booking; booking link required by eligibility | `booking-links.ts`, `outreach.ts:49` | HIGH | Reply-CTA template variant first; POOL link (PR-3b) |
| H5/N-05 | No triage/classification/case/idempotent task; stale signal on reassign | `inbound.ts:114-151`, `schema.prisma:3148` | HIGH (pilot B) | PR-4, PR-5 |
| H6/N-06 | Capacity per identity; enrollments ≠ sends; follow-ups ignored | `policy.ts:64`, `automation.ts:270` | HIGH | Governor (PR-8) |
| H7/G-15/G-22 | Rollout ends OFF; campaigns can't coexist; switch contradictions | `rollout.ts:168`, `automation.ts:356-360` | HIGH | Steady-state mode (PR-8); read-only eligibility during rollout (PR-1) |
| H8/N-07 | Opt-out detector unsafe for automation | `email.ts:120` | HIGH | Guarded detector (PR-4) |
| N-08 | `assignProspect` explicit transfers skip acquisition rules → FIELD-lane prospect can be handed to a REMOTE-only rep (who has no field tools) | `sales-pipeline.ts:~125` | MED | Router/transfer guard using `evaluateAcquisition` with `retainsOwnership=false` for lane-changing transfers (PR-5) |
| N-09 | `COMPLETED` on last queue, no quiet-period closeout | `sequences.ts:276` | MED | Closeout job (PR-8) |
| N-10 | Provider quota/plan unknown ("no Resend Pro" [D]); free-tier quotas are small (verify current plan) | `docs/sales-email-launch-readiness.md §0` | **P0 to verify** | Confirm plan before any volume (PR-0) |
| N-11 | Ops dispatch ceiling 25/run & 50/run, weekdays only | `cron/sales/route.ts:25-26` | MED | Config-driven batch + weekday/weekend setting (PR-8) |
| N-12 | System replies/OOO policy undefined (automated inbound never stops/pauses) | `inbound.ts:137-146` | MED | Explicit OOO policy (PR-4) |
| N-13 | Attribution absent for organic trials; Shop has no source fields; Checkout carries `client_reference_id`+`checkoutAttemptId` only | `schema Shop`, `billing.ts:114-117` | HIGH | Ref token → metadata (PR-10) |
| N-14 | FIELD prospects with email cannot enter post-visit automation without explicit design (cold gate correctly blocks until qualified visit) | `territory.ts:143-149` | LOW | P2: post-visit nurture lane |
| N-15 | No-email REMOTE: deferred forever, no call lane (`CrmTask.CALL` unused) | `remote-email.ts`, `schema CrmTaskType` | MED | Decision D-9 |
| N-16 | Campaign "authorization" is a singleton on `CrmLeadAutomation` (one sequence, caps) | `automation.ts:44,257` | LOW now | Keep singleton; `CrmCampaign` table only when ≥2 audiences |
| G-01…G-27 | v1 items (no contact review UI, self-approval holes, basis-kind bypass, no evidence prep, language, placeholder greeting, MX unwritten, dup emails, prioritisation FIFO, eligibility off during rollout, paused sweep, deliverability, reply triage, stage events, WON unreachable, no alerts…) | see v1 table; key refs: `casl-evidence.ts:79`, `sales-inbox.ts:278`, `casl.ts:20,37`, `contact-readiness.ts:93,110`, `templates.ts:20`, `schema.prisma:4407`, `assignment.ts:99`, `pipeline.ts:34-42`, `stripe-sync.ts:130` | as v1 | folded into PR blocks below |

---

## 5. Deliverable 3 — Unified FIELD + REMOTE seller workspace

One workspace, existing pages, **lane-aware filtered views** (no new CRM). Navigation already has Prospects, Pipeline, Tasks, Field, Inbox, Outreach, Calendar, Demos [V `platform-nav.ts`]. Add a "Work" home and rename queues; nothing is rebuilt.

| Section | FIELD seller | REMOTE-only seller | Manager / Super Admin | Source / change |
|---|---|---|---|---|
| **My field visits** | assigned LOCAL prospects, today's route, map, visit outcomes, follow-up tasks | **not shown; no capability** (`plan_field_routes`, `log_field_visits` only for FIELD mode — `access.ts:46-52`; `field` queue = NONE for REMOTE — `queues.ts`) | read-only overview per FIELD seller | `field-*` services + territory filter (PR-2) |
| **My remote replies** | threads `triage=NEEDS_HUMAN/HUMAN_OWNED`, owner=me, by priority & age | same | all, plus unassigned & overdue | inbox view over new triage columns (PR-4/5) |
| **My meetings** | all channels | all channels | team | `meetingScope` (exists), add filter |
| **My tasks** | real tasks only (visit follow-ups, REPLY, DEMO_PREP) | same | team + overdue | `CrmTask`; system tasks never created for nonresponders |
| **My opportunities** | ≥ ENGAGED, both channels | same | team | `pipelineBoard` excludes automation-lane NEW |
| *Hidden from sellers* | thousands of REMOTE leads, automated threads, completed sequences | same | visible in **Automation** views | — |

Required query changes (all additive, no migration): `queues.mine` ⇒ `FIELD-lane assigned ∨ REMOTE with human case`; `dashboardMetrics` totals/stale/open exclude automation-lane NEW; planner/map `bookWhere` add `territoryState=LOCAL ∧ assignmentMode≠REMOTE`; inbox default view = human cases, "Automation" view for managers; unread badge (`unreadCount`) counts human-owned only.

**Manager overview** (extend `/lead-radar/automation` + sales home for `view_team_reporting`): throughput (enrolled/sent/delivered), triage mix, response queues (unassigned, overdue), workload (open cases per human), conversions by lane/province/language/sequence, governor state, alerts.

Existing assignment data is **preserved**: the founder keeps ownership of REMOTE prospects already assigned; they simply stop being "work". A later optional bulk "return to campaign pool" can reuse the existing assignment preview/confirm pattern (owner choice D-3).

---

## 6. Deliverable 4 — Automated REMOTE campaign and reply triage

### 6.1 Campaign flow
Eligible (read-only engine) → **Governor** admits first-touches within capacity → enrollment (sender = campaign pool, language resolved, basis valid, no suppression) → scheduled steps (business days, seller-independent send window, recipient-timezone aware later) → every step re-checks `decideStop` + full send policy [V `dispatcher.ts`, `sequences.ts`] → quiet closeout. No seller task is ever created for non-response, opens, or completed sequences (opens aren't tracked — keep it that way).

### 6.2 Reply triage taxonomy (rules first; no LLM; precision before recall)
Ingest keeps the existing guarantees (threading by reply key/headers, self-sender guard, idempotency). New: strip quoted text (`>`, "On … wrote:", "Le … a écrit :", our footer) **before** classifying; store `classification`, `reason`, `classifierVersion`, `source=RULE|HUMAN` on the message and `triage` on the thread.

| Class | Detector (EN/FR) | Automatic action | Human? | Safe-direction logic |
|---|---|---|---|---|
| **OPT_OUT_EXPLICIT** | short stripped body; opt-out phrase; **no** negation within window; no interest words | `suppressEmail(REPLY_OPT_OUT)`, DNC contact, stop sequences, close case, audit; notify manager (count only) | none | wrongly suppressing costs one lead; wrongly sending breaches CASL |
| **BOUNCE / DSN** | `mailer-daemon`, DSN headers/subject | suppress hard bounces (already via Resend); stop | none | — |
| **AUTO_REPLY / OOO** | `Auto-Submitted`, `X-Autoreply`, `Precedence`, subject patterns (`isAutomatedMessage`) | **stop/hold per configurable policy using the parsed return date (SUPERSEDES the fixed 7-business-day pause);** never counts as interest; "no longer with company"/"left" ⇒ REVIEW | none (except leaver) | explicit, conservative, tested |
| **NEGATIVE** | short, explicit refusal ("not interested", "pas intéressé", "no thanks"), no question/"but"/interest words | stop sequence; classify `NOT_INTERESTED`; **no suppression** unless explicit opt-out; cooldown ≥90 d before any re-enrollment | none | anything with a question or "but" ⇒ not NEGATIVE |
| **INTERESTED / QUESTION / MEETING_REQUEST** | everything human that isn't above; boost for demo/prix/tarif/appelez/"send info" | stop sequence → **CASE** (priority High for meeting/interest) | **yes** | default for unknown human text is *route to human* |
| **AMBIGUOUS** | low confidence, wrong-person, forwards, mixed | stop sequence → REVIEW queue (manager/ops, 1-business-day SLA) | yes (light) | stopping is always safe |

Acceptance corpus (EN/FR, incl. top-posted/bottom-posted, quoted footer, "don't stop emailing me", "unsubscribe me from your other list but call me", OOO with return date, signature-only replies) is a merge gate (§10).

### 6.3 Sequence and capacity facts to keep
Send windows, business-day offsets, idempotency key `seq:<enrollment>:<step>`, CAS step counter, stop rules, global suppression, one-click unsubscribe, footer address gate — **all verified and reused unchanged**.

---

## 7. Deliverable 5 — Human case routing and workload balancing

**Case = (opportunity ≥ ENGAGED) + (thread HUMAN_OWNED) + (one open `REPLY` task)**, same owner. Idempotency: partial unique index on `CrmTask(prospectId) WHERE type='REPLY' AND status='OPEN'` plus `thread.routedAt/routeAttempts`; replays of the same inbound (provider id is already unique) cannot create a second case.

**Router (pure function + one service, transaction-scoped, CAS on owner):**
1. Existing active human owner of prospect/thread/opportunity ⇒ keep (continuity). 
2. FIELD-lane prospect (`requiredMode=FIELD`) ⇒ its FIELD owner / FIELD seller covering the territory; **never** a REMOTE-only rep. 
3. REMOTE ⇒ eligible = active, non-campaign, `acceptsReplyRouting`, language-compatible (`leadLanguages` exists), available (calendar/vacation switch), `openCases < maxOpenCases`; pick fewest open cases, tie → longest since last assignment (round-robin). FIELD reps are eligible for REMOTE cases. 
4. None eligible ⇒ unassigned human queue (managers/Super Admin) + escalation alert; **no auto-reassign loops**: one automatic re-route after owner inactivity (deactivated/vacation), otherwise escalate, never bounce. 
5. Signals/notifications go to the **thread owner's** user (fix H5), content-free (link + count), plus off-app email for High priority.

Manager rebalance: existing `reassign_prospects` capability + `reassignThread`/`assignProspect`, extended to move the whole case atomically (thread + opp + REPLY task) and guarded by `evaluateAcquisition` for FIELD-lane transfers (N-08).

**Escalation & SLA (defaults):** first response ≤1 business day (High: 4 business hours); at 50 % ⇒ nudge owner; at 100 % ⇒ notify manager; at 200 % ⇒ eligible for one auto re-route.

**Backpressure:** governor input `pressure = (unassigned actionable) + (overdue actionable) / eligible humans`. Above `soft` ⇒ new-enrollment budget ×0.5; above `hard` ⇒ **new enrollments 0** (follow-ups of started sequences continue unless `pauseAll`; inbound processing never stops). Resumes automatically with hysteresis. Human staffing scales with *actionable cases/day*, not messages sent.

---

## 8. Deliverable 6 — CASL evidence and review operating model

Principles: the system **prepares facts**, never **asserts consent**, never writes `APPROVED`; machine actors cannot approve (invariant test); a published address is not permission by itself.

**Evidence artifact** (immutable, stored with the discovered contact): source URL, fetch timestamp (UTC), HTTP status, content SHA-256, extracted snippet with the address, page type (contact page / footer / other), publication context (own domain vs third party), restriction-language scan result, mailbox type (role / named / free), email-domain = site-domain, MX result, language signal (`<html lang>`, text), crawl-policy version. Fetch rules: owner-approved policy, robots.txt, identified bot, rate-limited, GitHub-hosted worker (same pattern as the extractor).

**Quality tiers (deterministic, explainable, versioned):**

| Tier | Criteria | Review level |
|---|---|---|
| **A** | own-domain page, address visible, no restriction language, role-appropriate mailbox, domain match, MX ok | **Review-priority hint only (SUPERSEDED: no blanket approval, no sampling-as-sufficient — each recipient keeps individual evidence and an individual auditable decision under the approved policy)** |
| **B** | first-party page but free-mail address, obfuscated/image, or weak role relevance | individual or small cohort |
| **C** | directory / social / Overture-only | **not CASL-reviewable** (no implied-publication claim); phone/field/enrichment lane |
| **X** | restriction language detected | auto-rejected with reason (human may inspect, cannot approve over it) |

**Decisions with accountability:** per row a `CrmSendingBasis` (kind `IMPLIED_PUBLISHED_ADDRESS`, `PENDING_REVIEW`, `recordedBy = system principal`, evidence = artifact summary) is created by the cohort tool; an authorised **human** approves the cohort (preview → token → apply, stale-checked, same pattern as `reclassifyLegacyBases` [V `sales-casl-legacy.ts`]); each row stores `reviewedBy/At` and `reviewNote=BATCH:<auditId>`; batch audit stores ids, sample size and defects; defect ⇒ cohort refused. Because the recorder is the system, **the existing recorder≠approver rule already yields independence**; no loosening of `reviewAuthority`.

**Independence where a person recorded the evidence** (manual path, express consent, existing relationship): distinct *human* enforced via `PlatformSalesStaff.humanKey` (founder's two accounts share one key); Super Admin self-approval stays possible only for solo-operator mode, audited, and excluded from GO counts.

**All basis kinds:** `EXPRESS_CONSENT` and `IMPLIED_EXISTING_RELATIONSHIP` need structured evidence (form submission / email thread / transaction) and are not auto-enrolled without it; `EXEMPT` is never auto-enrolled (counsel-defined categories only); `IMPLIED_DISCLOSED_ADDRESS` (e.g. business card at a visit) is human-recorded by the FIELD rep and reviewed. The campaign accepts only an allow-list of kinds (setting).

**Expiry/revocation:** default TTL on published bases (recommend 12 months, counsel to confirm) and re-fetch before enrollment and every 90 days; **automatic revocation** (safe direction) when the address disappears or restriction language appears, stopping enrollments. Explicit opt-outs: immediate suppression (§6.2). Revoked/suppressed never re-added without a new basis and a person.

**Human minimum — SUPERSEDED:** see amendments. Bulk tooling may group rows for efficient review but every recipient retains its own evidence and decision record.

---

## 9. Deliverable 7 — Continuous operation and sending-capacity strategy

**Pipeline mode** (single displayed state): `ROLLOUT | STEADY | PAUSED`. STEADY = discovery/qualify/import/assign/seed/enrich/eligibility always on (non-sending). Campaign admission is separately switch-gated and authorised. Rollout code is untouched; STEADY is entered by the existing finish path without turning the master OFF (flagged change, rollout tests unchanged).

**Capacity (no hardcoded ceiling; current production values untouched):**
```
# SUPERSEDED/extended by amendment 6: count ALL outbound (incl. scheduled follow-ups) per identity, domain AND provider
dailyCapacity(domain) = min( configuredDomainCap, providerQuotaRemaining, rampCap(domain age/health) ) × healthFactor
followUpsDue(next K days) = count(ACTIVE enrollments by nextRunAt)             # forecast, K = sequence span
newEnrollmentBudget(today) = max(0, Σ dailyCapacity − followUpsDue(today) − reserve) × pressureFactor
```
Settings added to `CrmCommsSettings`: `globalDailyLimit`, per-domain caps, ramp schedule (e.g. 10→20→40→80… doubling only while bounce/complaint healthy), `maxNewEnrollmentsPerDay`; existing `defaultDailyLimit` (30) remains the default until the owner changes it. Cron batch sizes become settings; weekend flag. **Follow-ups count against capacity first**; first-touches get the remainder.

**Deliverability guardrails:** separate sending (sub)domain from transactional mail [V: both verified domains are used by product mail — D]; SPF/DKIM/DMARC alignment; one-click unsubscribe (exists); breaker auto-pauses *automated* sending at bounce ≥2 % or complaint ≥0.1 % over rolling windows (tunable) and alerts; provider-quota awareness (N-10).

**Throughput arithmetic (parametric, assumptions flagged):** with S steps and capacity C sends/day, steady new prospects/day ≈ C / S. Example: C=300, S=3 ⇒ ≈100 new prospects/day; actionable replies = 100 × r (r = observed actionable-reply rate — *unknown until the pilot; use measured value*) — e.g. r=3 % ⇒ ~3 cases/day. Humans needed ∝ cases/day ÷ (cases one person can progress per day), independent of C.

**Lifecycle table (what must be true to run each mode):**

| Setting | ROLLOUT (today) | STEADY discovery | Campaign admitted |
|---|---|---|---|
| `LEAD_RADAR_ENABLED` + live switch | ON | ON | ON |
| `automation.enabled` | ON (rollout) | ON | ON |
| `rolloutEnabled` | ON | OFF | OFF |
| eligibility stage | read-only (new) | ON | ON |
| `sendingEnabled` / `automatedSendingEnabled` | OFF | OFF | ON (owner) |
| campaign authorized (sequence ACTIVE + sender pool + caps + governor ON) | — | — | owner action |

---

## 10. Deliverable 8 — Dependency-ordered implementation roadmap (PR blocks)

All blocks: additive migrations only, feature-flagged, DB-suite tests on a scratch DB, no production writes, rollout tests unchanged. **No sending enabled by any block.**

| Block | Scope | Depends on | Schema | Closes | Risk |
|---|---|---|---|---|---|
| **PR-0 Ops/docs (no code)** | Run diagnostics (App. 1); confirm Resend plan/quota, sending-domain separation, switches; name approver; counsel scoping; adopt decisions D-1…D-12 | — | — | N-10, baseline | none |
| **PR-1 Compliance primitives** | `humanKey` + distinct-human check; basis-kind allow-list for automation + structured evidence for non-published kinds; legacy-NULL excluded from automation eligibility; evidence min aligned; placeholder-name-safe greeting; read-only eligibility during rollout (scoped to contact-bearing); guarded opt-out detector (pure, not wired); "machine cannot approve" invariant | — | `PlatformSalesStaff.humanKey` | G-03/04/05/09/16, H8 (pure part) | low |
| **PR-2 Workspace separation (view layer)** | planner/map LOCAL-only; lane-aware `mine`/dashboard/stale/pipeline/inbox defaults; nav "Work" home; manager Automation view | — | none | **H1, H2** | low; do first |
| **PR-3 Campaign sender & ownership separation** | `isCampaignSender`; campaign sender pool on `CrmLeadAutomation`; enrollment/eligibility use campaign sender; exclusions from human pools; reply-CTA template variants (3a). Pooled booking link kind `POOL` (3b) | PR-1 | staff flag, automation column, enum value | H3, H4 | med |
| **PR-4 Inbound triage & auto-suppression** | quote stripping, classifier + fixtures, thread `triage*`, message `classification*`, OOO pause, negative close, opt-out suppress, REVIEW queue, signal to thread owner | PR-1 | thread/message columns | H5 (part), H8, N-07, N-12 | med |
| **PR-5 Case routing & workload** | `REPLY`/`REVIEW` task types + partial unique index; router; SLA/escalation; manager rebalance (atomic case move, FIELD guard); notifications (content-free) | PR-4 (PR-3 for central sender) | enum values, index, staff `acceptsReplyRouting/maxOpenCases` | H5, N-08 | med |
| **PR-6 CASL evidence automation** | website artifact worker (GH Actions), MX, mailbox/role classification, language evidence, tiers, priority score, cross-prospect email flag | PR-1 | `CrmDiscoveredContact` columns | G-06/10/11/13, evidence | med (crawl policy) |
| **PR-7 Cohort review & batch decisions** | review page (filters, cohorts), preview→token→apply, sample QA, batch approve, contact creation with safe name, language cohort rule | PR-1, PR-6 | none/minor | G-01/02/08 | med |
| **PR-8 Continuous campaign engine** | pipelineMode, STEADY, governor (capacity, ramp, follow-up forecast, pressure), closeout, paused-sweep, re-verification/revocation job, config-driven batches | PR-3, PR-4, PR-5, PR-7 | settings columns | H6, H7, N-06/09/11, G-07/15/17/22 | high (touches rollout path; flagged) |
| **PR-9 Deliverability & monitoring** | breaker, domain metrics, heartbeats, alerts, ops dashboard, dead-man check | PR-8 (partly parallel) | counters/none | G-18/25/26 | low-med |
| **PR-10 Meetings, trial, WON, reporting** | booking→`DEMO_SCHEDULED` (system actor), send→`CONTACTED`, meeting outcome→stage; `ref` token → Checkout metadata → shop; Stripe sync → trial stamp / WON / MRR; channel-aware reports | PR-3b for pooled booking; independent otherwise | opp columns, shop attribution | G-21/23/24, N-13 | med (billing path; idempotent) |

**Critical path to national scale:** PR-1 → PR-3/4 → PR-5 → PR-6 → PR-7 → PR-8 → PR-9. PR-2 and PR-10 run in parallel. **First safe merge: PR-2** (fixes a present exposure, no campaign involved).

**Pilot staging:** *Pilot A* (manual first touches, ≤20, existing tools) after PR-0 + PR-1 + PR-2. *Pilot B* (automated sequence, ≤50, one sender, human = founder) after PR-3a + PR-4 + PR-5. *Scale* after PR-6…PR-9 (+3b, 10 for conversion measurement).

---

## 11. Deliverable 9 — GO / NO-GO

**Pilot A — manual first touches, 10–20 prospects (all must hold):** switches per Q3/Q4 (automated OFF, nothing queued); sender ACTIVE with real threaded reply; inbox placement verified Hotmail+Gmail; outreach domain isolated from transactional mail; Resend plan/quota confirmed; PR-1 deployed (distinct-human, basis allow-list, greeting fix); PR-2 deployed (planner/dashboard clean); ≥10 prospects with VERIFIED_REPAIR, hand-confirmed language, Tier-A-equivalent evidence (URL fetched and read by approver), basis APPROVED by a different human, no legacy-NULL, no duplicates across prospects, no suppression; counsel reviewed templates + basis rules; SOP for replies/opt-outs ≤1 business day; stop rules written.

**Pilot B — automated sequence, ≤50 prospects, caps unchanged, governor ON (all must hold):** Pilot A succeeded (≥10 sends, 0 complaints, bounce <2 %); PR-3a/4/5 deployed; triage corpus passes (0 false-negative opt-outs, 0 interested→auto-closed in corpus, ≥95 % correct on others); every actionable reply produced exactly one case in ≤5 min (E2E tests green); opt-out → suppression ≤1 min; backpressure test passes; alerts reach the owner (test fire); automated switch is an owner action with an immediate off.

**National scale (all must hold):** Pilot B ≥2 weeks with bounce <2 %, complaint <0.1 %, ≥20 real replies correctly classified/routed (measured, human-audited), ≥3 demos booked and synchronised, ≥1 trial attributed; PR-6…PR-9 live; capacity plan per domain with ramp; provider plan sized; approver capacity ≥2 humans; actionable-reply SLA ≥90 % met; counsel sign-off on the bulk process, evidence TTL and retention; breaker and backpressure exercised in staging; runbooks in place.

---

## 12. Deliverable 10 — End-to-end acceptance tests (DB suites with fake provider; scratch DB per suite)

Each is a named test in a new `tests/hybrid-pipeline-*.test.ts` plus extensions of existing suites. All assert **no unintended sends/enrollments**.

*Workspace & ownership*
1. FIELD rep: sees LOCAL assigned prospects, route, visit outcome task; **does not** see 5,000 national REMOTE prospects in planner, map, `mine`, dashboard, pipeline.
2. REMOTE-only rep: no field capability/queue/route; sees only replies/meetings/tasks/opps; cannot be assigned a FIELD-lane case (router + manual transfer guard).
3. Manager: sees both lanes, unassigned and overdue queues, workload per human.
4. REMOTE prospect imported/assigned/enrolled ⇒ **zero** tasks and zero entries in any seller's actionable views.

*Compliance*
5. Machine principal cannot approve; recorded-by-system + human approve works; same `humanKey` cannot approve manual evidence; Super Admin self-approval excluded from GO counts.
6. `EXEMPT` / unstructured `EXPRESS_CONSENT` never enrol; legacy-NULL never enrol; expired/revoked/Tier X never enrol.
7. Artifact loses the address / gains restriction text ⇒ basis auto-revoked, enrollment stopped.

*Campaign & capacity*
8. Governor: first-touch budget = capacity − forecast follow-ups; follow-ups never starved; breaker pause; ramp; provider-quota exhaustion defers, never fails.
9. Idempotent enrollment: concurrent ticks, retries, duplicate address across two prospects ⇒ one sequence.
10. No reply ⇒ steps 0/3/8 sent, quiet closeout, **no task**.

*Triage*
11. Corpus EN/FR (≥60 labelled messages incl. quoted footer, negation, OOO with return date, forwards, signature-only): opt-out ⇒ suppress+stop+audit ≤1 min; OOO ⇒ pause then resume; negative ⇒ stop/close; interested/question/meeting ⇒ one case; ambiguous ⇒ stop + REVIEW.
12. Bounce/complaint ⇒ suppression everywhere (all sequences, imports, other senders).
13. Replay of same inbound ⇒ no second case/task.

*Routing*
14. Eligible pool chosen by lowest open cases/language/availability; existing human owner retained; no ping-pong; unavailable owner ⇒ one re-route; none eligible ⇒ unassigned + escalation alert.
15. Overload ⇒ new enrollments paused, inbound and existing sequences continue; recovery with hysteresis.
16. Human takes over: replies from own identity, thread/opportunity/task continuity, signal to new owner.

*Meetings → revenue*
17. Public pooled booking ⇒ meeting + opportunity `DEMO_SCHEDULED` + sequence stop + task; reschedule/cancel sync.
18. Trial from ref token ⇒ trial stamped on the originating opportunity; ambiguous email match ⇒ *suggestion only*.
19. Stripe events: trial ⇒ no WON; first paid ⇒ WON once (replays idempotent), MRR and plan stored; cancel/past_due recorded separately; refund handled.

*FIELD + REMOTE together*
20. Same prospect is FIELD-visited then replies by email: one opportunity, one owner (the FIELD rep), no duplicate tasks, automated cold gate respected.
21. One seller with both lanes works a day: visits + replies + meeting + tasks in one workspace; actions on either lane write to the same activity/audit trail.

*Rollout safety*
22. With rollout active: existing rollout suites unchanged; read-only eligibility runs; no pilot/sending flag flips; STEADY entry does not turn the master OFF.

---

## 13. Deliverable 11 — Monitoring, alerts and failure recovery

Alerts = e-mail (existing platform e-mail) to the owner, **counts and links only** (Law 25); optional second channel later. Heartbeat per stage in `CrmLeadAutomationRun.counters`.

| Metric | Alert if | Auto-recovery | Manual |
|---|---|---|---|
| Minutes since last automation run / last cron success (both workflows) | >45 min in window | lease expiry self-heals | check secrets / Actions |
| Stage error codes; rollout `haltCode`; `pausedReason` | any >1 h | resume after halt is manual by design | owner decision |
| Candidates with usable email not imported, by bucket (App. 1 A); oldest HUMAN_REVIEW | oldest >14 d | policy tuning | cohort review |
| PENDING discovered contacts oldest; Tier-A backlog vs 4 weeks of capacity | <2 or >8 weeks of capacity | — | resize review |
| Basis PENDING_REVIEW oldest; self-/same-human approvals | >5 business days / >0 | — | approver |
| Capacity: forecast follow-ups vs capacity; budget for first touches | budget=0 for >2 d, or deferral rate >10 % | governor throttles | add domain/plan |
| Sent/delivered/bounce/complaint/unsub by domain (rolling 1 d/7 d) | bounce ≥2 %, complaint ≥0.1 % | **breaker pauses automated sending** | investigate list quality |
| Provider quota used | >80 % | defer | upgrade plan |
| Triage mix; REVIEW queue age; opt-out→suppression latency | REVIEW >1 business day; latency >1 min | — | review |
| Actionable cases: unassigned, overdue, per-human open; SLA % | any unassigned >1 h; overdue >0; SLA <90 % | escalation, one re-route, **backpressure** | manager rebalance |
| Enrollments PAUSED by reason, age | >3 d | sweep resumes cleared causes | fix cause |
| Messages QUEUED past `nextAttemptAt` >30 min (switch-hold separate) | any | retry/backoff exist | check cron |
| Opps with sends/meetings but stage unchanged; meetings without opp sync | >0 | system stage events | — |
| Trials/paid with no attribution while contact match exists | >0 | suggestion queue | confirm |
| Evidence artifacts older than TTL / revoked this week | TTL breach >0 | re-fetch job, auto-revoke | review revocations |

**Failure recovery matrix (existing behaviour verified; additions marked ➕):** extractor stall → retry/resume (3 attempts) · tick crash → lease expiry, poison isolation · import failure → attempt-count then FAILED · outbound failure → backoff ×5, stale-lock requeue · inbound provider failure → 5xx, provider retry, idempotent · bounce/complaint → suppression · ➕ breaker pause · ➕ governor backpressure · ➕ paused-sweep · ➕ evidence re-verification/auto-revoke · ➕ stuck-case escalation.

---

## 14. Deliverable 12 — Decisions needed from you (with recommended defaults)

| # | Decision | Recommended default | Why |
|---|---|---|---|
| D-1 | **SUPERSEDED** — existing authorized seller identities; central/pooled configurable later. Was: Team identity "GarageOS Sales Team"; first human reply introduces the person | Honest, no seller approval, no mismatch when cases reroute |
| D-2 | First-touch CTA before pooled booking exists | Reply-to-book template variant; pooled `POOL` link in PR-3b | Avoids H4 blocking the pilot |
| D-3 | Existing REMOTE prospects owned by the founder rep | Keep ownership (attribution); hide via lane-aware views; optional later bulk release | Zero data movement, rollout untouched |
| D-4 | Who is the independent human reviewer | A second person (wife/brother/counsel-approved) with Sales Manager role; `humanKey` enforced | Closes two-account loophole |
| D-5 | **SUPERSEDED** — per-recipient evidence and decisions, counsel-approved policy. Was: Tier A batch (5 % sample); B individual; C not reviewable; X blocked; published-basis TTL 12 mo | Minimum human work without bypass — **counsel to confirm** |
| D-6 | Allowed basis kinds for automation | Published-address (approved) + structured express consent only; never `EXEMPT` | Removes fabricable path |
| D-7 | **SUPERSEDED** — configurable, return-date based, conservative. Was: Pause 7 business days then resume; leaver ⇒ review | Conservative, explicit |
| D-8 | Negative-reply policy | Stop + classify; no suppression unless explicit; ≥90 d cooldown | Respectful, reversible |
| D-9 | No-email REMOTE prospects | Keep deferred now; decide a call-task lane after pilot data | Avoid scope creep |
| D-10 | Capacity targets | Keep 30/day until PR-8; ramp plan 10→20→40→80 on a separate sending domain, only while healthy | Reputation first |
| D-11 | Human capacity defaults | `maxOpenCases` 15; SLA 1 business day (High 4 h); soft/hard pressure at 70 %/100 % of capacity | Tunable after pilot |
| D-12 | Provider/plan | Confirm Resend plan and quotas now; dedicated sending domain; consider provider limits before ramp | Hard ceiling otherwise |
| D-13 | Closeout of non-responders | Leave opportunity in NEW (no terminal lock), record sequence outcome, re-contact only after ≥90 d and ≤N touches/12 mo | `LOST` is terminal and blocks re-enrollment [V `pipeline.ts`, `sequences.ts:117`] |
| D-14 | Pilot sequencing | A → B → scale as in §10/§11 | Evidence before volume |

---

## Appendix 1 — Read-only diagnostics (NOT RUN; same `BEGIN READ ONLY … ROLLBACK` convention; counts only)

v1 queries A–G remain valid (decomposition of NOT_IMPORTED-with-email, PENDING cohorts, duplicate addresses, eligibility table, basis kinds × review × self-review, unassigned by province, paused enrollments). Additional:

```sql
-- H. Is the field planner polluted? Prospects per staff, by mode and territory state
BEGIN READ ONLY;
SELECT s.id AS staff_id, s."salesMode", p."territoryState", p."assignmentMode", count(*) AS n
FROM garageos."PlatformSalesStaff" s JOIN garageos."CrmProspect" p ON p."assignedStaffId" = s.id AND p.status = 'ACTIVE'
GROUP BY 1,2,3,4 ORDER BY 1, 5 DESC;
ROLLBACK;

-- I. What a rep sees as "open/stale": NEW opportunities on owned prospects by lane
BEGIN READ ONLY;
SELECT o."assignedStaffId", p."assignmentMode", o.stage, count(*) AS n,
       count(*) FILTER (WHERE p."lastActivityAt" IS NULL OR p."lastActivityAt" < now() - interval '14 days') AS stale
FROM garageos."CrmOpportunity" o JOIN garageos."CrmProspect" p ON p.id = o."prospectId"
WHERE p.status = 'ACTIVE' AND o.stage IN ('NEW','CONTACTED','ENGAGED','QUALIFIED','DEMO_SCHEDULED','DEMO_COMPLETED','DECISION')
GROUP BY 1,2,3 ORDER BY n DESC;
ROLLBACK;

-- J. Sender domains in use and what is approved
BEGIN READ ONLY;
SELECT split_part(i."fromEmail",'@',2) AS domain, i.status, count(*) AS identities FROM garageos."CrmSenderIdentity" i GROUP BY 1,2;
SELECT "approvedDomains", "defaultDailyLimit", "sendWindowStartHour", "sendWindowEndHour" FROM garageos."CrmCommsSettings";
ROLLBACK;
```
Interpretation: H/I confirm or refute H1/H2 [P]; J feeds N-10/D-12.

## Appendix 2 — v1 findings carried forward (G-IDs), with code references and target block

| ID | Finding [V unless noted] | Reference | Sev | Block |
|---|---|---|---|---|
| G-01 | 4,206 PENDING discovered contacts cannot be reviewed in-product: single-id Super Admin action, no list/bulk/UI | `actions/lead-radar.ts:153`, `contact-readiness.ts:93` | HIGH | PR-7 |
| G-02 | Two human gates in series (accept contact → record/approve evidence); accept carries no legal judgement | same + `sales-casl.ts` | HIGH | PR-7 (merge into one cohort decision) |
| G-03 | Second-person control: Super Admin may self-approve; founder's two accounts count as two people; rep-owned national prospects can only be approved by Super Admin | `casl-evidence.ts:79`, `access.ts` (manager scope) | **P0** | PR-1 (`humanKey`), D-4 |
| G-04 | Only published/disclosed-address kinds need review; `EXPRESS_CONSENT`/`IMPLIED_EXISTING_RELATIONSHIP`/`EXEMPT` valid immediately on ≥12 chars free text | `sales-inbox.ts:278`, `casl.ts:20,37`, `casl-evidence.ts` schema | **P0** | PR-1 (allow-list + structured evidence) |
| G-05 | Legacy `reviewStatus NULL` stays valid; pilot SQL counts NULL as OK; evidence threshold 20 (SQL) vs 12 (engine) | `casl.ts:37`, `queues.ts usableBasis`, `remote-pilot-readonly.sql` Q6/Q8 | **P0** | PR-1 |
| G-06 | No automatic evidence packet; `capturedAt` = our staging time; Overture ≠ proof of conspicuous publication | `contact-readiness.ts:70` | HIGH | PR-6 |
| G-07 | Published bases never lapse by default; no re-verification | `casl.ts suggestedBasisExpiry` | MED | PR-8 |
| G-08 | Language always UNKNOWN for Lead Radar; no evidence or bulk decision; sequences pause `LANGUAGE_REQUIRED` forever | `language.ts`, `sequences.ts:299` | **P0**(pilot hand-set)/HIGH | PR-6/7 |
| G-09 | Accepted contact named "Business contact"/"General contact" ⇒ greeting "Hi Business,"/"Bonjour General," | `contact-readiness.ts:110`, `templates.ts:20-23,325` | HIGH | PR-1 |
| G-10 | `mxStatus` never written | `schema.prisma:4407` | MED | PR-6 |
| G-11 | Same address on N prospects: unique only per (prospect,email) and (sequence,contact) | `schema CrmDiscoveredContact`, enrollment partial unique | MED | PR-6/8 |
| G-12 | Work on unusable candidates: HUMAN_REVIEW has no ageing/alert; eligibility scans prospects with no contact; REMOTE no-email has no call lane | `national.ts`, `eligibility.ts refreshEligibility` | HIGH | PR-6/8, D-9 |
| G-13 | No prioritisation: assignment FIFO by createdAt; import usable-email first then id | `assignment.ts:99`, `remote-email.ts nextImportIds` | HIGH | PR-6 (score), PR-8 |
| G-14 | QC REMOTE outside Greater Montréal excluded from rollout assignment; seller hard-coded by e-mail; `NO_CAPACITY` stalls with a counter only | `rollout.ts (domain) :13-14` | MED | PR-8, App. 1 F |
| G-15 | Rollout finish ⇒ master OFF; seeding shares master switch; a halt stops seeding everywhere | `rollout.ts:168`, `contact-readiness.ts:86` | HIGH | PR-8 |
| G-16 | Eligibility (and pilot/release) skipped while `rolloutEnabled` ⇒ funnel rungs 5–8 unobservable | `automation.ts:356-360` | **P0** | PR-1 |
| G-17 | PAUSED enrollments never auto-resume; counted against pilot total cap | `sequences.ts:299`, `automation.ts:262-266` | MED | PR-8 |
| G-18 | No warm-up ramp, no bounce/complaint breaker; cold and transactional likely share domains [D] | `policy.ts:64` | HIGH | PR-8/9, D-10/12 |
| G-19 | Opt-out reply is a UI banner + manual click | `inbox/[threadId]/page.tsx:33`, `sales-inbox.ts:200` | HIGH | PR-4 (guarded; see H8) |
| G-20 | No reply classification, task or stage move | `inbound.ts` | HIGH | PR-4/5 |
| G-21 | Booking doesn't move the opportunity; ≥QUALIFIED needs contact + assessed need | `meetings.ts:74`, `pipeline.ts:34-48` | MED | PR-10 |
| G-22 | Switch contradictions (UI ON but stage skipped; rollout halts on pilot/sending; finish turns master OFF) | `automation.ts:356-360`, `rollout.ts (domain) safetyViolation` | MED | PR-8 |
| G-23 | No trial/signup attribution for organic signups | `schema Shop`, `billing.ts` | HIGH | PR-10 |
| G-24 | `WON` unreachable (`WON_RESERVED`; `wonAt`/`convertedShopId` unused); Stripe sync finalises SalesDemo only | `pipeline.ts:34-42`, `schema.prisma:2746`, `stripe-sync.ts:130`, `sales-demo-finalize.ts` | HIGH | PR-10 |
| G-25 | No alerts/heartbeat/ageing; seeding silent when idle | `contact-readiness.ts:34`, `rollout.ts halt()` | HIGH | PR-9 |
| G-26 | Seeding runs after the 45 s tick inside `maxDuration=60`; full-queue no-email scan per tick | `cron/lead-radar/route.ts:11,25`, `remote-email.ts scanNoEmailQueue` | MED | PR-8/9 |
| G-27 | Only source is Overture; e-mail field sparse | `automation.md` [D] | MED | measure first (App. 1 B) |


---

## PR-2 as built (workspace separation)

**Principle.** Ownership (`assignedStaffId`) and attribution are never modified. A new module, `src/lib/sales-crm/work-lane.ts`, defines what is *actionable seller work*:

- **Cold automated REMOTE lane** = `territoryState = NATIONAL` ∧ imported by Lead Radar ∧ *no human case*. A **human case** = an opportunity at `CONTACTED…DECISION`, an open task, or an open email thread containing a non-automated inbound message. Fragments are written positively (no `NOT` over nullable columns), so prospects whose territory is not computed yet never disappear.
- **FIELD candidates** = territory not `NATIONAL` (local or not yet classified).

**Where it applies.**

| Surface | Change |
|---|---|
| Prospects → *Mine* | actionable work only (local/FIELD, hand-entered, unclassified, and national prospects with a human case) |
| Prospects → default list (sellers) | actionable only; an explicit search still finds any owned prospect; managers/Super Admin keep the full book |
| Prospects → *Ready / Eligibility / Missing* (sellers) | cold lane removed |
| Prospects → new *Automated REMOTE* queue | managers / Super Admin only; sellers get an empty result |
| Dashboard | work totals, stage funnel, open and stale counts are actionable-only; closed stages always counted; managers get a separate *Automated REMOTE* tile |
| Pipeline board | cold untouched NEW deals are not cards (also removes the 700-card crowd-out); closed totals complete |
| Field planner candidates / map viewport / search / territory summary | national prospects excluded |
| Field route **new stops** | `NOT_FIELD_TERRITORY` for national prospects (already-planned stops and logged visits are unaffected) |
| Inbox | campaign-only threads (no human inbound, no manual/meeting outbound) leave seller views and unread counts; managers get an *Automated* view; any human reply makes the thread a normal conversation |

**Permissions unchanged:** REMOTE-only sellers still have no field capability, queue or planner; FIELD sellers keep both lanes in one workspace; assignment, caps, rollout, sequences, sending switches, CASL decisions and suppression are not touched.

**Known follow-ups (intentionally not in PR-2):** team/staff pages still show raw owned-prospect counts (attribution); `loadSellers` workload (assignment caps) still counts owned prospects; transferring a FIELD-lane prospect to a REMOTE-only rep is still possible by explicit transfer (N-08, PR-5).


---

## PR-1 as built (compliance primitives)

**Constraints honoured:** no consent invented, nothing auto-approved, no switch changed, no sending enabled, Lead Radar not interrupted; stored evidence/approval history is never rewritten (one additive nullable column, no backfill).

| Item | What changed |
|---|---|
| Basis-kind bypass | Every kind a person can record (`EXPRESS_CONSENT`, `IMPLIED_EXISTING_RELATIONSHIP`, `EXEMPT` as well as published/disclosed address) now requires structured evidence and is stored `PENDING_REVIEW`; free text alone is refused (`EVIDENCE_INCOMPLETE`). Role relevance stays an address-kind condition. |
| Automation reading | New `evaluateAutomationBasis`: system-originated sends (enrollment, worker, dispatcher, eligibility) need the newest basis to be an allowed kind (`AUTOMATION_BASIS_KINDS`: published, disclosed, express) **and `APPROVED`**. Legacy/`NOT_REQUIRED`/`LEGACY_UNREVIEWED`/`EXEMPT`/existing-relationship keep working for a person's own manual email but never back automation. New eligibility reasons: `BASIS_KIND_NOT_ALLOWED` (and the existing `BASIS_UNREVIEWED`). |
| Same-human self-approval | `User.personKey` (Super Admin sets/clears under *Team → Same-person links*, audited `PERSON_LINK_SET`); accounts with a shared **verified** recovery mailbox are linked automatically. `reviewAuthority` denies approve **and** reject when the recorder is the same person. The Super Admin self-review exception is closed (`ALLOW_SUPER_ADMIN_SELF_REVIEW = false`). Machine principals have no review capability; a tripwire test fails if any new code writes `reviewStatus: "APPROVED"`. |
| Greeting | `firstNameOf` ignores stand-in names ("Business contact", "General contact", "Contact général", "Info", …) ⇒ "Hello," / "Bonjour,". Stored names are unchanged. |
| Eligibility during rollout | The `eligibility` stage follows its own switch even while `rolloutEnabled` (read-only advice; during the rollout it only assesses prospects with an emailable contact). Rollout activation still leaves it OFF; release and pilot remain gated off during the rollout. |
| Pilot SQL pack | Q6/Q8 count only `APPROVED` bases of automation-allowed kinds, treat another account of the same person as self-approval, and report `basis_manual_only`. |

**Flagged for owner/counsel (policy choices, one-line constants):** (1) requiring review for *every* kind a person records, including express consent; (2) closing the Super Admin self-review exception (a solo operator can no longer approve their own evidence — a second person is required); (3) the automation allow-list of kinds; (4) automation now rejects legacy bases (the earlier "deploy is behaviour-neutral" guarantee applies to manual email only).

## Simplified strategy and PR-A as built (READY-pool foundation)

**Status:** PR-2 and PR-1 are merged. The owner replaced the 11-PR roadmap with a shorter path to a continuously replenished pool of **READY** contacts: independent repair shops, a usable business address, valid CASL basis, FIELD excluded, Québec REMOTE in French, the rest of Canada REMOTE in English. No lead scoring, segmentation, AI enrichment or per-shop research. Decisions on record: machine-collected evidence may be *proposed* but is never auto-approved; batch approval is per visible, individually selected row (later review PR); evidence keeps source and collection time and is revalidated (intervals proposed in the evidence-worker PR); role-based and free-mail addresses need recipient-specific evidence; crawling is limited to the shop's own site, honouring robots.txt and rate limits; replies: interested → responsible seller, negative/ambiguous → automation stops pending safe handling, out-of-office is neither interest nor consent.

**Remaining path:** PR-A (this) → in parallel: evidence worker (propose-only), scalable per-recipient review UI, inbound triage (PR-4) → release governor (seeded reproducible batches, capacity across identity/domain/provider reserving follow-ups) → owner-approved EN/FR copy → pilot. Skipped: scoring, central sender, pooled booking, routing engine, priority engine.

**PR-A as built.** Reuses `CrmOutreachEligibility` (one row per prospect, best contact); adds two nullable columns (`readiness`, `campaignLanguage`) and the enum `CrmReadiness` (migration `20261028090000_outreach_readiness`, additive).
- `readinessOf(reasons)` (pure): `SUPPRESSED` > `INELIGIBLE` > `PENDING_REVIEW` > `PENDING_EVIDENCE` > `READY`. Owner / seller / sender conditions (`OPERATIONAL_REASONS`) never affect readiness; they still gate `decision = ELIGIBLE`, which the pilot uses.
- New reasons: `NOT_VERIFIED_REPAIR` (only `repairFit = VERIFIED_REPAIR`), `TERRITORY_NOT_REMOTE` (stored `territoryState = NATIONAL` **and** a fresh classification of the address agree; LOCAL, UNRESOLVED and never-computed are never READY, so Québec without city/postal does not leak), `DUPLICATE_ADDRESS` (one address, one recipient; the lowest active prospect id keeps it).
- Campaign language: contact > business > territory default (`territoryDefaultLanguage`: QC → FR, other province → EN, province-less → postal letter G/H/J → FR). Applied only to NATIONAL prospects, at assessment and at enrollment/step time (`campaignDefaultFor`); the resolver never detects language and still asks a human elsewhere.
- Existing automation-basis rule is untouched: only an independently APPROVED published-address / disclosed-address / express-consent basis counts; EXEMPT and existing-relationship are `BASIS_KIND_NOT_ALLOWED` → INELIGIBLE.
- Dashboard (Lead Radar → Automation, stage 5): READY / pending review / pending evidence / suppressed / ineligible, READY by language, not-yet-assessed. Rows with `readiness IS NULL` are re-assessed on the next tick.
- Production counts: `docs/operations/ready-pool-readiness.sql` (+ `.md`), strictly read-only, aggregate output. **No production figure is claimed until it has been run on the Neon production database.**

## Automated qualification pipeline (supersedes the evidence-review items above)
The owner replaced the independent-review model with an **automated CASL evidence engine** (`casl-auto-v1`) and an **early commercial screen** with exclusion tombstones. Overture discovery → cheap screen (no unusable staging rows) → email-level provenance → import (same screen in the shared transaction) → seeding → bounded own-website evidence → SUPPORTED / INSUFFICIENT / BLOCKED → readiness (`EVIDENCE_SUPPORTED` until the owner activates the policy, then `READY`). The two-reviewer rule, same-person links, review page and approval capability were removed; history is preserved. Full description, research, limits and activation steps: [docs/compliance/automated-casl-evidence.md](../compliance/automated-casl-evidence.md). PR-4 inbound triage (safe opt-out handling) remains the next block before any live sending.
