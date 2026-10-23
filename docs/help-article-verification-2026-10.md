# Help article verification (QA-02), 2026-10-23

Scope: the 10 Help Center articles in `src/lib/marketing-resources.ts` (`GUIDES`) that had not been corrected yet. The three already-corrected articles (`estimate-to-invoice`, `approval-history`, `maintenance-reminders`) are out of scope here.

Method: every step and claim was traced to the shop screen (`src/app/(site)/admin/(shop)/**`, `src/components/**`), the server action (`src/actions/**`), the English UI strings (`src/lib/admin-locale/**`, `src/lib/portal-i18n.ts`), the plan gates (`src/config/entitlements.ts`) and the role permissions (`src/domain/permissions.ts`; roles Owner / Mechanic / Read only). Code reading only: the app was **not** run, so anything that needs a live screen, a delivered SMS or a real device is marked UNVERIFIABLE instead of guessed.

Verdicts: **VERIFIED** (code matches the original text), **MISMATCH** (original text was wrong, incomplete in a way that misleads, or used a label that does not exist; fixed in this PR), **UNVERIFIABLE** (cannot be confirmed from code).

Help articles are English only (no FR counterpart exists in `GUIDES` / `HELP_ARTICLES`, and FR Help routes are not published), so no FR text changed.

## Roles and plans used below

- Roles in the UI: Owner, Mechanic, Read only (`settings.ts` locale `team.roleOwner/roleMechanic/roleViewer`). Default permissions: `src/domain/permissions.ts:42-47`. Settings, team, billing, domains and locations are Owner only and never delegable (`permissions.ts:4-6`).
- Plan gates (min plan): `inventory.manage`, `import.full`, `dvi.photos`, `dvi.templates`, `dvi.customerReport`, `branding.customDomain`, `branding.customSender`, `permissions.advanced` = Pro (`entitlements.ts:36-59`); `organization.multiLocation`, `reports.multiLocation` = Complete (`entitlements.ts:76,79`). Core user limit 3 (`entitlements.ts:108`).

## Summary

See the totals at the end of this file. The main fixes: wrong Settings tab / menu names (Notifications vs Domain & Email, Calendar & Hours, "Work Orders" vs "Work orders"), a wrong import flow (four steps and "update empty fields" vs three steps and "update with the file's non-empty values"), web bookings described as "requests" and customer notices described as "email and text", inventory not marked as Pro, and the DVI "Needs attention" label and "estimate" lines that are actually unpriced draft quote lines.

Terminology note for the owner: the shop UI says **Quotes** (`layout.ts` nav `quotes: "Quotes"`, `quotes.ts` list title), while Help and the marketing site say "estimate". Where an article names a button or menu I used the exact UI string ("Create quote from findings", "Create work order" on a quote). The three previously merged articles still say "Open Estimates", which is not a real menu entry. Not changed here; see "Needs the owner" in the PR.

---

## 1. set-up-your-shop

| # | Claim | Verdict | Evidence | Fix |
|---|---|---|---|---|
| 1 | Create account, choose a plan to start a 14-day free trial, $0 today | VERIFIED | `domain/subscription-state.ts:35` (`TRIAL_DAYS = 14`); `onboarding.ts` en `stepPlan` ("Choose your plan — free for 14 days ... You pay $0 today; billing starts automatically after the trial unless you cancel") | none |
| 2 | Order: plan first, "then follow the setup steps" | MISMATCH | `OnboardingWizard.tsx:56` `FULL_FLOW = [1,2,3,4,5,PLAN,FINISH]`: the plan/payment step comes after the shop steps, and a payment method is required | Reworded: "During setup you choose a plan and add a payment method"; listed the setup steps |
| 3 | "Invited team members sign in with the login the owner created" | MISMATCH | There is no invitation flow. The Owner creates an account with a temporary password: `actions/users.ts:55-100`, `settings.ts` en `team.newUser/tempPassword/createAccount` (lines 1142-1151) | Reworded to "Team members sign in with the account the Owner created" |
| 4 | Settings and team actions depend on role | VERIFIED | `settings/page.tsx:46-194` (only the General tab for non-owners); `actions/settings.ts:45` (`settings.manage`); `permissions.ts:4-6` | Made explicit (Owner only, others see General and cannot save) |
| 5 | Check shop name, address, phone, "contact email" | VERIFIED (label differs) | `ShopSettingsForm.tsx:278`; `settings.ts` en `shopInfo` (Shop name, Address, Phone, **Main email**, hint line 913) | Label changed to "Main email" and the reply behavior added |
| 6 | "Add your shop logo and review the branding options" | MISMATCH | Logo upload is in General (`ShopSettingsForm.tsx:232`, `settings.ts:894-898`, JPG/PNG/WebP/SVG, 4 MB, "appears on every PDF invoice"); the look of the public page is the separate Booking page tab (`settings/page.tsx:120`) | Logo step gives the limits; branding review points to the Booking page tab |
| 7 | "Check the timezone and invoice settings" | MISMATCH | No timezone field in General. The timezone is only displayed, read-only, in Calendar & Hours (`AppointmentBookingSettings.tsx:135-137`). Invoice-related settings in General are the tax number and Taxes (`settings.ts:933`, `taxes.infoNote`) and e-transfer (`ShopSettingsForm.tsx:403`) | Replaced with the tax number / Taxes step (with the "issued invoices keep their taxes" rule); timezone mentioned as shown under Calendar & Hours |
| 8 | Save changes, then review a document or the public booking page | VERIFIED | Each card has its own "Save changes" (`settings.ts` shopInfo/etransfer/taxes) | Added "Each section has its own Save changes button" |
| 9 | Team: add staff and assign a role | VERIFIED | `TeamManagement.tsx:144,162,194`; roles Owner / Mechanic ("can create and edit") / Read only (`settings.ts:1147-1161`) | Added exact button names and the three roles |
| 10 | (omitted) Core limit of 3 users | MISMATCH (omission) | `entitlements.ts:108`; `actions/users.ts:58-63`; `settings.ts:1206` ("Your current plan allows up to N users") | Added: Core up to 3 users, Pro and Complete unlimited; Pro and Complete can adjust per-user permissions (`entitlements.ts:56`) |
| 11 | "Have an administrator check the role instead of sharing an administrator password" | VERIFIED (term) | There is no "administrator" role; the role is Owner | Wording changed to Owner |
| 12 | Review opening hours, booking settings and mechanics who can receive appointments | VERIFIED | Settings → Calendar & Hours (`settings/page.tsx:81`; `settings.ts` `booking.hoursTitle`, `mechanicsTitle`) | Added the tab name and the Services tab (`settings/page.tsx:112`, onboarding step 3) |
| 13 | Add a client and vehicle before the first appointment | VERIFIED | `AppointmentForm.tsx` has `vehicleId`; `clients/new` | none |

## 2. configure-online-booking

| # | Claim | Verdict | Evidence | Fix |
|---|---|---|---|---|
| 1 | "In Settings, open the website appointment booking section" | MISMATCH | The tab is **Calendar & Hours** (`settings.ts:878`, `settings/page.tsx:81`) | Tab named |
| 2 | Needs access to shop settings | VERIFIED | Calendar & Hours tab is Owner only (`settings/page.tsx:46,79-93`) | Said "Owner" |
| 3 | "A configured public shop address"; ask admin for it | MISMATCH | The link comes from the shop identifier (slug), set in the **Booking page** tab under "Public booking link" (`settings.ts:948`; `BookingPageConfigurator.tsx:185-190`). The in-app hint points to the General tab (`settings.ts:1072`) but the form is in the Booking page tab | Wrote the real location; inconsistency flagged for the owner |
| 4 | "Enable online booking when the shop is ready to receive requests" | MISMATCH | The switch is "Accept online appointments" and saves immediately (`settings.ts:1057,1049`); web bookings are not requests: they are created `status: "CONFIRMED"`, `source: "PUBLIC_WEB"` (`api/book/[slug]/route.ts:174-175`) | Rewritten with the exact label and behavior |
| 5 | "Set the interval between offered start times, minimum advance notice and how far ahead" | MISMATCH (labels) | Labels are "Duration of each appointment (min)", "Minimum lead time (hours)", "Bookable up to (days ahead)" (`settings.ts:1058-1060`). The first field is the start-time grid step and the fallback duration (`booking-slots.ts:250-255`); service lengths come from Settings → Services | Exact labels used and the relationship explained; save button is "Save web booking settings" (`settings.ts:1073`) |
| 6 | Opening and closing per day, days off closed | VERIFIED | `settings.ts:1075-1079` (Opening hours, Closed, "Save hours") | Added the card and button names |
| 7 | Choose mechanics and check individual hours | VERIFIED | `settings.ts:1080-1089` ("Receives web bookings", "Schedule", "Own schedule (otherwise follows the shop's hours)") | Exact labels |
| 8 | Why a time may not appear: hours, advance notice, service length, existing appointments | VERIFIED | `booking-slots.ts:225-296` (lead time, window, mechanic windows, overlaps, grid vs duration) | Added: at least one mechanic bookable, and online booking pauses without an active subscription (`booking-slots.ts:60`) |
| 9 | "Customers are notified by email and, when you have a shop number, by text" | MISMATCH | Policy is SMS first (if the shop has SMS on and the client has a phone) with email as the fallback, never both unless the client chose "Always both" (`appointment-notify.ts:2-4,146-156`; `domain/sms.ts:226-234`; `route.ts:196-201`) | Rewritten |
| 10 | Review the appointment in the calendar; check the send result | VERIFIED | Appointments page uses a month calendar (`appointments/page.tsx:6,61`); web bookings carry a "Web" badge (`appointments.ts` `webBadge`); appointment History records the notice (`appointments.ts` `history`) | Pointed to History; staff alert mentioned (`route.ts:205`, `settings.ts:990`) |
| 11 | Offered times for a working day look right on the public page | UNVERIFIABLE | Needs a running page with data; slot logic itself was read | kept as the user's check |

## 3. clients-and-vehicles

| # | Claim | Verdict | Evidence | Fix |
|---|---|---|---|---|
| 1 | Open Clients and search first | VERIFIED | `clients.ts` `list.title/searchPlaceholder`; `actions/clients.ts:17-45` also matches vehicle plate, make and model | Added search fields |
| 2 | Reuse existing record to keep history together | VERIFIED | Client detail shows recent invoices; vehicle page service history (`clients.ts` `detail`, `vehicleDetail`) | none |
| 3 | (implied) duplicates are caught | MISMATCH (omission) | `createClient` (`actions/clients.ts:74`) does no duplicate check | Stated plainly |
| 4 | Check name, email and phone | VERIFIED (detail) | Name/Company and Phone are required, email optional (`clients.ts` `clientForm`) | Detailed |
| 5 | Preferred communication language "where available" | VERIFIED | `clientForm.languageLabel` "Preferred language", `notifyChannelLabel` "How to notify them" with four options | Exact options named |
| 6 | Add the vehicle under the client | VERIFIED | `detail.addVehicleArrow` "Add vehicle →"; required: make, model, year, plate; optional VIN, color, mileage unit (`clients.ts` `vehicleForm`) | Added required fields |
| 7 | Verify the vehicle when creating appointment / estimate / invoice | VERIFIED | `AppointmentForm.tsx`, `InvoiceForm.tsx` (used by quotes: `quotes/new/page.tsx:3,29`) | "estimate" -> "quote" |
| 8 | Before a return visit review associated documents | VERIFIED (detail) | Client page: "Recent invoices"; vehicle page: Service history, Active reminders, Work orders (`clients.ts` `detail`, `vehicleDetail`) | Named what each page shows |
| 9 | Avoid deleting records with history | VERIFIED | Confirm texts: delete client removes vehicles and history, delete vehicle removes service history, irreversible (`clients.ts` `deleteClient.confirm`, `deleteVehicle.confirm`; `actions/clients.ts:138-146`) | Made the consequences explicit |
| 10 | "Ask the shop administrator" for corrections your role cannot make | VERIFIED | Read only role lacks `customers.write` (`permissions.ts:43-47`); Mechanic has it | Wording: Read only role / Owner |

## 4. import-your-data

| # | Claim | Verdict | Evidence | Fix |
|---|---|---|---|---|
| 1 | CSV or Excel | MISMATCH (precision) | Only `.csv` or `.xlsx`, first row headers, up to 4 MB (`import.ts:91-92`; `domain/import.ts:20`) | Stated |
| 2 | One row per vehicle with owner email, phone or name | VERIFIED | `import.ts:61` (vehicles hint) | none |
| 3 | "Import in four steps" | MISMATCH | The wizard has three steps: "1. File", "2. Map columns", "3. Review & import" (`import.ts:88-90`) | Rewritten as three steps with exact button names (Read file, Validate file, Download rows with errors (CSV), Import now: `import.ts:93,104,115,119`) |
| 4 | Column names matched automatically and adjustable | VERIFIED | `import.ts` `mappingHelp` ("We matched what we could. Check each field...") | none |
| 5 | Validation writes nothing and lists problem rows | VERIFIED | `import.ts:105` ("Nothing has been imported yet"), `issuesTitle` | none |
| 6 | Duplicates: "skip, or update empty fields" | MISMATCH | Options are "Skip it (keep what GarageOS has)" and "Update it with the file's non-empty values", and update is Pro/Complete only (`import.ts:100-102`, `dupUpdatePro`; `entitlements.ts:40`) | Corrected; also added "create the customer when a vehicle's owner isn't found" (`import.ts:103`) |
| 7 | Download error rows, fix, import again | VERIFIED | `import.ts:115`, `doneBody` | none |
| 8 | Limits: 500 rows all plans, inventory + 10,000 rows on Pro/Complete | VERIFIED | `domain/import.ts:22-23`; `import.ts:126`; `entitlements.ts:40` | none |
| 9 | (omitted) who can import | MISMATCH (omission) | `import.run` is Owner by default, delegable on Pro+ (`import/page.tsx:12`; `actions/import.ts:65`; `permissions.ts:48`) | Added |

## 5. digital-vehicle-inspections

| # | Claim | Verdict | Evidence | Fix |
|---|---|---|---|---|
| 1 | Open Inspections, create one for the vehicle | VERIFIED | `inspections.ts:207,233` ("New inspection", "Start inspection"); client and vehicle required, optional performed by, linked work order, mileage (`inspections.ts:228-232`) | Detailed |
| 2 | Every plan starts from the standard checklist; Pro/Complete use own templates | VERIFIED | `actions/inspections.ts:133-181` (template needs `dvi.templates`); `inspections-advanced.ts:20-22`; `entitlements.ts:47` | Listed the standard items (`inspections.ts:91-100`) |
| 3 | "Mark each item Good, **Needs attention** or Service required" | MISMATCH | Staff UI labels are Good / **Attention** / Service required (`inspections.ts:199-201`); "Needs attention" appears only on the shared customer report (`inspections-advanced.ts:32`) | Corrected |
| 4 | Add custom items | VERIFIED | `inspections.ts:248` ("Add a custom item..." / "Add") | none |
| 5 | Photos on Pro and Complete | VERIFIED | `actions/inspections.ts:265`; `entitlements.ts:46`; `inspections.ts:250` ("Add photo") | Button name |
| 6 | "Create an estimate from the findings to price the recommended work" | MISMATCH | The button is "Create quote from findings"; it creates a **draft quote** with one line per Attention / Service required item at **$0.00** and opens the editor (`actions/inspections.ts:327-380`, line 369; `domain/inspection.ts:17-19`) | Corrected: prices must be added before sending |
| 7 | Share a link to the customer report (Pro/Complete) | VERIFIED | `actions/inspections.ts:389-405`; `entitlements.ts:48`; `inspections-advanced.ts:26` ("Create shareable link", "Copy link") | Button names |
| 8 | Report layout: findings first, then photos and the full checklist | MISMATCH (precision) | Report page shows "Recommended work" (findings) with each finding's notes and photos, or the checklist when everything is good, then a collapsed "Full checklist" (`inspection/[token]/page.tsx:56-100`) | Rewritten; report uses the client's language (line 38) and needs no sign-in |
| 9 | Stop sharing: old link stops working | VERIFIED | `actions/inspections.ts:409-413` (token set to null) | Button name "Stop sharing" |
| 10 | Report is mobile-friendly | UNVERIFIABLE | Described in `inspections-advanced.ts:26`; needs a device to confirm | Left as in product copy |

## 6. work-orders

| # | Claim | Verdict | Evidence | Fix |
|---|---|---|---|---|
| 1 | "Open Work Orders" | MISMATCH (label) | Menu entry is "Work orders" (`layout.ts` nav `workOrders`; `work-orders.ts:311` "New work order") | Corrected |
| 2 | Create from an approved estimate | VERIFIED (detail) | Only an **accepted** quote shows "Create work order"; one work order per vehicle, created as Approved (`QuoteActions.tsx:240-246`; `actions/work-orders.ts:233-266`; `quotes.ts:288`) | Detailed |
| 3 | Add concern, vehicle, lines, assign a mechanic | VERIFIED | `work-orders.ts:338-347` ("Assigned technician", "Customer concern *", lines may be left empty) | Labels |
| 4 | Status: "checked in, waiting for approval, waiting for parts, in service and ready for pickup" | MISMATCH | Two statuses exist. Workflow: Open, Awaiting approval, Approved, In progress, Completed, Invoiced, Cancelled with buttons Send for approval / Approve / Start work / Mark completed / Cancel order (`work-orders.ts:275-282,396-401`; `domain/work-order.ts:3-11`). Customer-facing: Checked in, Awaiting approval, **Waiting on parts**, In service, Ready for pickup, **Picked up** (`work-orders.ts:289-297`) | Rewritten with both |
| 5 | Pro/Complete: stocked part on a line deducts inventory automatically | VERIFIED | `actions/work-orders.ts:182` (`inventory.manage`); `work-orders.ts:359` ("Stock is deducted when the work order is saved"); `entitlements.ts:36` | Field name "Inventory part" |
| 6 | Editing quantity / swapping part / cancelling adjusts stock; refuses stock you don't have | VERIFIED | `actions/work-orders.ts:359,389,580` (reconcile, release on cancel and delete); `STOCK_ERRORS` line 76-95 ("Not enough stock of ...") | Added delete |
| 7 | Ready for pickup: customer notified by email or text per shop settings | VERIFIED (detail) | Once per work order, channel per client preference and the two Settings toggles (`actions/work-orders.ts:423-487`; `settings.ts:999`) | Added "once", Settings → Notifications |
| 8 | Invoice can be created straight from the Work Order | VERIFIED (detail) | "Invoice" button only when status is Completed (`WorkOrderActions.tsx:140-148`; `domain/work-order.ts:8`; `actions/work-orders.ts:496-502`) | Added the condition |
| 9 | Front desk sees status without asking the shop floor | UNVERIFIABLE | Marketing phrasing; list shows both status columns (`work-orders.ts` `colStatus`, `colJobStatus`) | Kept in softened form |

## 7. manage-inventory

| # | Claim | Verdict | Evidence | Fix |
|---|---|---|---|---|
| 1 | (omitted) Inventory is Pro and Complete | MISMATCH (omission) | `entitlements.ts:36`; Core sees "Inventory is a Pro feature" (`inventory.ts:174`); all inventory actions check `inventory.manage` (`actions/inventory.ts:85,140,185`) | Added to summary and first section |
| 2 | Create a part with identifying details and quantity | VERIFIED (detail) | `inventory.ts:169-204`: Name, SKU (optional, unique), Description, Unit cost, Sale price, Starting quantity, Reorder point; Low stock badge (`inventory.ts:186`) | Fields listed |
| 3 | Record incoming stock | VERIFIED | `inventory.ts:219-230` ("Adjust stock"; Stock received / Manual adjustment / Used on a job / Return) | Types listed |
| 4 | Usage on a job; Work Order line deducts automatically on Pro/Complete | VERIFIED | `actions/work-orders.ts:182-218,359`; manual "Used on a job" exists (`actions/inventory.ts:190-195`) | Clarified manual vs automatic |
| 5 | Review the movement history | VERIFIED | `inventory.ts:232` ("Movement history") | Capitalized label |
| 6 | Reconcile against a physical count | VERIFIED | Negative Manual adjustment subtracts (`inventory.ts:222`); cannot go below zero (`actions/inventory.ts:205`, `inventory.ts:237`) | Linked to Manual adjustment |

## 8. multi-location

| # | Claim | Verdict | Evidence | Fix |
|---|---|---|---|---|
| 1 | Multi-Shop is Complete | VERIFIED | `entitlements.ts:76`; `organization.ts:35` | none |
| 2 | Owner of the main location administers the organization | VERIFIED | `organization.ts:37`; `organization/page.tsx` (non-owner redirected); `actions/locations.ts:106` (`requireOwner`) | "Owner" capitalized |
| 3 | Open Organization in the menu; enter name and add; current shop stays main | VERIFIED | `organization.ts:40-42,54` (first time button "Create organization and location", then "Add location"); `actions/locations.ts:130-160` | Added exact button names |
| 4 | (omitted) What the new location inherits | MISMATCH (omission) | Logo, brand color, tax details, booking template copied (`actions/locations.ts:139-156`); onboarding banner (`onboarding.ts` `additionalLocation`) | Added |
| 5 | Settings → Locations to give team members access | VERIFIED | `settings.ts:1190-1192` ("Team access", "Give access to", "Add"); `actions/locations.ts:188`. Staff must already exist (`noOtherUsers`) | Added "create staff under Team first" |
| 6 | Switch and finish a short setup (hours, services, booking) | VERIFIED | `OnboardingWizard.tsx:57` `SHORT_FLOW = [1,3,4,FINISH]` = shop details, services, hours, share link | Listed |
| 7 | "Location pill in the top bar ... always shown" | MISMATCH (precision) | The pill shows only when the user can access more than one location and is `hidden lg:inline-flex` (`Topbar.tsx:151-162`) | Reworded; Organization page marks the active one "Active now" (`organization.ts:41`) |
| 8 | Each location keeps its own records; staff see only their locations | VERIFIED | `organization.ts:34,58` | none |
| 9 | Reports: all locations or one, Locations report: sales, jobs, new customers | VERIFIED | `reports/page.tsx:238-243`; `reports.ts:31,55` (filter "Location", "All my locations"; comparison columns invoices, revenue, refunds, net, open WOs, new customers); `entitlements.ts:79` | Exact filter and column names; "Compare locations" shortcut (`organization.ts:52`) |
| 10 | Consolidated reports respect permissions | VERIFIED | `reports/page.tsx:243` (financial kinds hidden without finance permission) | none |

## 9. customer-portal

| # | Claim | Verdict | Evidence | Fix |
|---|---|---|---|---|
| 1 | Included in every plan | VERIFIED | No portal key in `CAPABILITY_MIN_PLAN` (`entitlements.ts:35-80`) | none |
| 2 | What customers see: vehicles, history, appointments, jobs in shop, estimates (review and answer), invoices with PDF, shared inspection reports, reminders | VERIFIED | `portal-i18n.ts:55-80` sections; `portal/[token]/page.tsx:64-170`; PDF link `portal/[token]/invoices/[invoiceId]/page.tsx:41` | none |
| 3 | Carries the shop logo and colors | VERIFIED | `PortalShell.tsx:20-31` | none |
| 4 | Works on a phone | UNVERIFIABLE | Responsive classes exist but needs a device | "is designed to work on a phone" |
| 5 | Customer portal card on the client; email the link / create a link to copy | VERIFIED | `StaffPortalCard.tsx`; `portal.ts:26-30` ("Email portal link", "Create link to copy", "Revoke all links"); `actions/portal.ts:35-71` | Exact button names |
| 6 | (omitted) A copied link is shown once | MISMATCH (omission) | `portal.ts:35` ("for security it can't be shown again") | Added |
| 7 | Links expire after 30 days; only the latest few stay active | VERIFIED | `domain/portal.ts:6,8` (30 days, 5 active); `lib/portal.ts:55-66` | "latest five" |
| 8 | Revoke all links | VERIFIED | `actions/portal.ts:71-78` | Added Read only role can see but not change (`customers.write`, `actions/portal.ts:36,46,72`) |
| 9 | Customers can request a fresh link; emailed only to the address on file; never reveals if an email is a customer | VERIFIED | `actions/portal.ts:95-130` (identical response, 3 per hour: `domain/portal.ts:10`); `portal-i18n.ts:91-93` | Added the "Email me a new link" entry point and the rate limit |

## 10. branded-communications

| # | Claim | Verdict | Evidence | Fix |
|---|---|---|---|---|
| 1 | "Open **Notifications** in settings" for mailboxes, domain and routing | MISMATCH | Those live in **Settings → Domain & Email** (`settings.ts:884`, `settings/page.tsx:164`; menu entry "Email & domain" -> `?tab=domain`, `dashboard/page.tsx:378`). The Notifications tab holds SMS number, team alerts, appointment and work order notices (`settings/page.tsx:97-109`) | Corrected |
| 2 | Administrator rights needed for domain and routing | VERIFIED | All domain / sender / route actions call `requireOwner` (`actions/domains.ts:76,121,151,175`; `actions/communications-settings.ts:39,65`) | "Owner" |
| 3 | "Review or add the mailboxes your shop sends from" | VERIFIED (label) | Card "Your addresses" with "New address"; adding beyond the GarageOS address needs Pro (`settings.ts:1230-1236`; `actions/communications-settings.ts:42`; `entitlements.ts:59`); address must start with the shop identifier (`settings.ts:1247`) | Labels, plan gate and identifier rule |
| 4 | Configure the sending domain for your own address | VERIFIED | "Custom domain for your emails", "Register domain", DNS records, "Verify" (`settings.ts:1289-1309`; `actions/domains.ts:75-150`); Pro (`entitlements.ts:58`) | Steps |
| 5 | Review communication routing | VERIFIED | "Automatic rules" / "Customize by type" (`settings.ts:1250-1259`) | Labels |
| 6 | (omitted) What Core sees | MISMATCH (omission) | Without Pro the tab shows only "Your email sender" with the GarageOS address built from the shop identifier (`EmailSetupSection.tsx`, `email-sending.ts` `banner`; `sender-identity.ts:83-97`) | Added |
| 7 | Send a test through a real workflow and check delivery | UNVERIFIABLE | Delivery depends on DNS / Resend at runtime | Kept; added that replies go to the confirmed Main email (`sender-identity.ts:53-66`) |

---

## Totals

Counted from the verdict column above (rows marked "VERIFIED (detail/label/term)" count as VERIFIED, "MISMATCH (...)" as MISMATCH).

| Verdict | Count |
|---|---|
| VERIFIED | 63 |
| MISMATCH | 26 |
| UNVERIFIABLE | 5 |

## Not changed, found while verifying

- `src/lib/feature-pages.ts:92` (public Features page): "Mark each item Good, Needs attention or Service required" has the same wrong staff label as the old Help text; the feature pages have FR counterparts and their own tests, so it was left for a separate PR.
- `settings.ts:1072` (`missingSlugHint`): tells the user to set the identifier in the "General tab", but the form is in the **Booking page** tab. Product string, not Help copy.
- Menu name: the shop UI says "Quotes"; Help (including the three previously corrected articles) and marketing say "estimate" and "Open Estimates".
- Not run against a live UI: no screens were walked with Playwright; everything above comes from reading the code and locale files.
