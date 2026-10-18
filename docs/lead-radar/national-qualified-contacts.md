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

Scope notes: the rollout order is BC, MB, SK, NS, NB, NL, PE, YT, NT, NU; ON and AB were extracted earlier and are finished through the same gates; Québec is never re-extracted by the rollout and is processed only through the import scope the owner sets (its Greater Montréal/Laval/Rive-Sud geography stays FIELD). Evidence throughput is `evidenceBatch` (default 25) per 15-minute tick; the owner may raise it on the Automation page.
