# GarageOS privacy impact assessment (PIA / EFVP) — initial working record

Date: 2026-09-29
Owner: Privacy Officer

## Project
GarageOS is a multi-tenant B2B SaaS for independent automotive shops. It handles shop staff accounts and shop-entered records relating to customers, vehicles, appointments, estimates, work orders, inspections/photos, invoices/payments, communications, reminders, tire storage, imports, customer portal activity and optional integrations.

## Necessity and purposes
The core data categories support identifiable shop-management workflows. New categories should not be collected merely because they may be useful later. Direct-cost communications and integrations are activated for service delivery or shop-selected workflows.

## Principal privacy risks and current mitigations
- Cross-tenant disclosure: tenant ownership checks, role/access controls and attack tests.
- Excessive internal access: role/permission controls and least-privilege policy.
- Public endpoint abuse: authentication/authorization and rate limiting where appropriate.
- Messaging misuse: suppression/STOP and CASL review required.
- Provider/cross-border processing: provider inventory, contractual safeguards and transfer assessment required.
- Account compromise: authentication, rate limiting and security logging.
- Data persistence after termination: retention/export/deletion schedule must be finalized.
- Incident response: documented procedure and register required.
- Imports: shop must have authority to import data; imported data receives the same access controls.

## File storage (updated 2026-09-30)
Files are classified at write time. Public: shop logos and booking-page images only (public bucket, no customer data). Private: invoices, payment receipts, accounting documents, DVI/inspection photos and Inbox attachments (private buckets; tenant-scoped paths; access only via server-side download or short-lived signed URLs after shop/customer-token authorization; DB stores paths). Shared DVI reports serve photos through a token-checked redirect (60 s). Storage location: Supabase us-east-1 (USA) — a transfer outside Quebec that must be covered by the transfer assessment below.

## Cross-border/provider assessment
Before GO, complete the service-provider register with actual contracting entity, processing/storage location, categories transferred, sensitivity, purposes, contractual safeguards, incident terms, deletion/return behavior and relevant legal context. Do not mark this section complete from assumptions.

## Decisions
Privacy Officer contact is public. Public privacy information is bilingual. French Terms are available in the same technological channel as English. Material new integrations, tracking, automated decisions or new categories of personal information trigger PIA review.

## Open items
Verify provider regions/contracts; finalize retention periods and backup rotation; verify CASL controls; document production backup/restore; verify any analytics/cookies and determine whether consent UI is required; confirm legal business identity/address details for final legal notices.
