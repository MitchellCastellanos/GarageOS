# National qualified email contacts — qualify first, admit only what passes

One-time national program, then ONE persistent inventory. Nothing here sends, enrolls or activates a sending policy.

```
Overture (13 jurisdictions) → commercial screen (tombstones, no staging row) → dedupe (candidate + CRM match)
  → email syntax/role/free-mail flags → casl-auto-v3 evidence (own website, exact address) → decision
  → SUPPORTED only: ONE CrmContact + AUTO_SUPPORTED basis linked to the persisted assessment  →  /platform/sales/lead-radar/inventory
```

## Where each kind of record lives
| Record | Storage | In the sales inventory? |
|---|---|---|
| Raw extracted candidates, commercially rejected records | `CrmDiscoveryCandidate` / `CrmDiscoveryRejection` (tombstone: ids, hash, reason codes only) | No |
| Address waiting for / failed / INSUFFICIENT / BLOCKED evidence, network failures, retries | `CrmDiscoveredContact` (queue state) + `CrmCaslAssessment` (append-only history) | No — no `CrmContact` exists for it |
| Source checkpoints | `CrmDiscoveryRun` (resumable chunks, quality gate) | No |
| SUPPORTED address | `CrmContact` + `CrmSendingBasis(AUTO_SUPPORTED, caslAssessmentId)` | **Yes, only while every condition below holds** |

An address is admitted **once for the whole country** (advisory lock + check inside the admission transaction): a second business carrying the same mailbox ends as `REJECTED` / `DUPLICATE_EMAIL:<prospectId>` and creates no contact or basis. Admission is idempotent (history key per decision) and never overwrites CRM ownership or history.

## The inventory (`src/lib/lead-radar/inventory.ts`, read-only)
SELECTABLE = newest AUTO_SUPPORTED basis not revoked, not expired, current rule version, assessed for exactly this address; its assessment is SUPPORTED, current-version, hash-verified, not expired and the newest for that address, whose discovered row is still SUPPORTED; the business is active, unmerged, `VERIFIED_REPAIR` and `NATIONAL` (REMOTE); no DNC and no active suppression. Evaluated on every read, so expiry, revocation, a restriction found on revalidation, an unsubscribe or a new rule version removes the contact from the selectable view at once; a fresh SUPPORTED decision restores it. Nothing is deleted. FIELD (`LOCAL`) businesses never appear (separate field-sales view); FIELD prospects without email are reported separately and never counted as email-ready.

Filters: status (SELECTABLE / SUPPRESSED / OUT_OF_SCOPE / REVOKED / EXPIRED / STALE_RULE / NOT_SUPPORTED / any), province, language (contact → business → Québec=FR/else EN territory default), business name, evidence expiring within N days, previous outreach, campaign history. Pilot and national campaigns use this same inventory. Send time still re-checks evidence, suppression, policy and switches (`evaluateAutomationBasis`) — routine safety, not a second qualification.

## The ten numbers (`nationalProgramReport()`, shown above the table)
Jurisdictions completed (stage READY, of 13) · source records processed · rejected by commercial screening · email candidates evaluated · SUPPORTED · INSUFFICIENT · BLOCKED (current outcome per address) · technical retry backlog (never assessed + INSUFFICIENT for a transient fetch failure) · **admitted and selectable (the number that matters)** · running / completed.

## Running it (owner action — engineering cannot click it)
1. National page → **Start the national rollout** (existing card). Activation now also sets the evidence stage ON; it still keeps eligibility, release, pilot and every send switch OFF and refuses to start if any send/pilot switch is ON.
2. The 15-minute automation cron and the 2-hourly GitHub worker (`lead-radar-extract.yml`) run it to the end with no further input (both are verified live on `main`; the worker's `peek` returns `NOTHING_QUEUED` until step 1).
3. The rollout is COMPLETE only when every jurisdiction has finished extraction → qualification → import → assignment **and** every address of a qualified REMOTE shop has a first CASL decision. It then stops the one-time work (qualify/import/assign OFF) but leaves the master switch and the evidence stage ON so freshness (30 days), revocation and later incremental refreshes continue. An address whose assessment crashes 5 times is parked and shows in the technical state; it cannot hold the program open.
4. Read the final inventory at `/platform/sales/lead-radar/inventory`.

## Scope, Québec, throughput, shared mailboxes
* **All 13 jurisdictions.** Order: BC, MB, SK, NS, NB, NL, PE, YT, NT, NU, then **QC** (swept in full). ON and AB were extracted earlier and are reconciled through the same gates (no second extraction). A finished run counts as a province's extraction only if extractor **>= 1.4.0** made it, so an older Québec pilot run is swept again; staging is unique per source record, so re-sweeping refreshes candidates in place and creates no duplicates (CRM rows are never overwritten). Québec keeps its configured FIELD geography (Greater Montréal / Laval / Rive-Sud stay FIELD and are never assigned by the rollout); outside it, prospects are REMOTE with the French default; the rollout assigns only REMOTE prospects, to the one seller. The inventory page shows every jurisdiction's documented terminal state: COMPLETED, COMPLETED_NO_CANDIDATES, HALTED (+ code) or IN_PROGRESS.
* **Throughput.** Per candidate: <= 9 requests, 400 KB, 15 s (unchanged). Now 8 concurrent candidates (was 4) but never two of the same website domain; evidence gets up to 90 % of the tick (was 30 %); tick budget 50 s (function limit 60 s); activation raises the per-tick ceiling to 120 (a ceiling only — the tick deadline is the real bound); the automation cron runs every 15 minutes around the clock (was 11:00-23:59 UTC; the repository is public so Actions minutes are free). Expected: ~50-140 addresses per tick, ~5,000-13,000 per day, from fetching small public pages only (no paid provider, no AI). The measured value is shown on the inventory page (checks in the last 24 h and average seconds per address) so the estimate is replaced by data after the first hours. Transient failures (unreachable site, budget, incomplete terms) back off 1 day, 7 days, then the INSUFFICIENT schedule (7 / 30 / 90 days); a SUPPORTED address never loses its evidence to a transient failure. No total candidate limit exists.
* **Shared mailboxes.** An address is admitted once (one `CrmContact`); the other business keeps its own prospect, history and discovered row (`REJECTED`, `DUPLICATE_EMAIL:<prospectId>:<contactId>`), is not merged and is not re-queued. One address is also enrolled once: enrollment takes an advisory lock and refuses an address that is in any live enrollment or already finished the same sequence (`EMAIL_ALREADY_ENROLLED`); the sequence runner stops any older-data duplicate (`DUPLICATE_ADDRESS`) before a message exists.
