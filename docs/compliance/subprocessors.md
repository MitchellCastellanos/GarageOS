# GarageOS service-provider / subprocessor register

This is an internal register and must be verified against production configuration and vendor contracts before publication.

| Provider/category | Purpose | Data potentially involved | Location / transfers | Status |
|---|---|---|---|---|
| Hosting / application infrastructure | Run GarageOS | account and application data | verify contract/regions | VERIFY |
| Database / storage | persistence and backups | shop/customer/application data | verify contract/regions | VERIFY |
| Stripe | subscription billing/payments | account, billing, transaction data | verify | IN USE |
| Twilio | SMS | phone numbers, message content/status | verify | IN USE |
| Resend | email | email addresses, message content/status | verify | IN USE |
| Media/file provider(s) | DVI/booking/media | uploaded files/photos and metadata | verify actual provider(s) | VERIFY |
| Intuit QuickBooks Online | shop-enabled accounting integration | accounting/customer/invoice/payment data selected for sync | verify | OPTIONAL |

Do not publish vendor location claims until verified. For every provider, keep the agreement/DPA, security information, deletion/return terms, incident-notification obligations and subprocessor information where applicable.
