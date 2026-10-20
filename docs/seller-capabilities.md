# Seller capabilities: Field sales + Remote sales

**Model (no schema change).** Two explicit capabilities, stored in the existing `PlatformSalesStaff.salesMode`:

| Stored `salesMode` | Field sales | Remote sales |
|---|---|---|
| `FIELD` | yes | yes (always) |
| `REMOTE` | no | yes |

`FIELD` has always meant *Field sales + Remote sales*: the territory engine lets a FIELD seller acquire REMOTE-held prospects (`evaluateAcquisition` only denies `FIELD_MODE_REQUIRED` to non-FIELD sellers), `capabilitiesFor(kind, "FIELD")` is the REMOTE set plus `plan_field_routes`/`log_field_visits`, and the automation tests run a single "founder" seller that takes FIELD territory and the rest of Canada. So the existing seller needs **no data change**: it keeps Field sales, Remote sales, its ~10,133 owned national prospects, opportunities, activities and tasks. Nothing is reassigned.

**Invariants (enforced in code and tests)**
- Remote sales is on for every active seller; it cannot be switched off (`REMOTE_SALES_REQUIRED`).
- Field sales is optional and can only be granted or removed by a Super Admin (`manage_team` is Super Admin-only; `updateSalesStaff`/`createSalesStaff` additionally refuse any mode change by a non-Super Admin with `FIELD_GRANT_FORBIDDEN`). Managers and reps cannot grant it to anyone, themselves included.
- Turning Field sales off sets `REMOTE`: it removes field privileges and grants nothing. Ownership, coverage, manager hierarchy and FIELD-held territory rules are evaluated by the unchanged territory engine.
- Every change is audited (`STAFF_MODE_CHANGED`, before/after `{ salesMode, fieldSales, remoteSales }`, actor); a save that changes nothing writes nothing.
- A profile save that does not send a mode now keeps the current mode (previously the schema default silently reset a FIELD seller to REMOTE).

**UI.** Team member and "new team member" forms: a *Sales capabilities* group with **Field sales** (checkbox) and **Remote sales** (always on, shown checked and locked). The team member page shows both. EN/FR.

**Calling.** New capability `place_sales_calls` (Remote sales; all sellers). `loadCallingQueue` / `getMyCallingQueue` lists the seller's own assigned prospects that are REMOTE-held (`territoryState = NATIONAL`), inside the seller's coverage, `phoneEligibility = CALLABLE`, not DNC/archived/merged and not in an open call; no email required; Montréal/FIELD-held prospects are never listed (they stay in the field workflow). The no-simultaneous-calls guarantee is a database constraint on the call-session table delivered with the voice backend (queue accepts the open-call set).

**Phone-first assignment.** `PHONE_FIRST_AUTO_ASSIGN=enabled` lets the automatic stage assign CALLABLE-phone REMOTE prospects to the allow-listed sellers; a FIELD + REMOTE seller qualifies exactly like a REMOTE seller, FIELD-held prospects still follow FIELD rules. Manual assignment never required an email.
