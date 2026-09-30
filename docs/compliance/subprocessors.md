# GarageOS service-provider / subprocessor register

This is an internal register and must be verified against production configuration and vendor contracts before publication.

| Provider/category | Purpose | Data potentially involved | Location / transfers | Status |
|---|---|---|---|---|
| Hosting / application infrastructure | Run GarageOS | account and application data | verify contract/regions | VERIFY |
| Supabase (Postgres auth tables + Storage) | object storage: public shop logos/booking images (`public-assets`), private invoices/receipts/accounting docs/DVI photos (`accounting`), private Inbox attachments (`communications`) | shop logos/photos; invoices, payment receipts, accounting documents, DVI photos, email attachments (customer/financial data) | Project "Garage OS" region **us-east-1 (N. Virginia, USA)** as reported by the Supabase API on 2026-09-30 — outside Quebec/Canada; DPA and safeguards still to be verified | REGION VERIFIED, CONTRACT VERIFY |
| Stripe | subscription billing/payments | account, billing, transaction data | verify | IN USE |
| Twilio | SMS | phone numbers, message content/status | verify | IN USE |
| Resend | email | email addresses, message content/status | verify | IN USE |
| Media/file provider(s) | DVI/booking/media | uploaded files/photos and metadata | Stored in Supabase Storage (row above); no separate media provider found in code | SEE SUPABASE |
| Intuit QuickBooks Online | shop-enabled accounting integration | accounting/customer/invoice/payment data selected for sync | verify | OPTIONAL |

Do not publish vendor location claims until verified. For every provider, keep the agreement/DPA, security information, deletion/return terms, incident-notification obligations and subprocessor information where applicable.
