# Automatic branded sales email signatures

Signatures are **generated**, never typed. Source of truth: `src/domain/sales-comms/signature.ts` (pure, shared by the live preview and the outgoing-mail renderer, so the preview is exactly what recipients get).

## Data used (nothing entered twice)
| Signature part | Source |
|---|---|
| Name | Sender identity display name (`CrmSenderIdentity.fromName`) |
| Title | Identity job title → falls back to the staff profile title → default “Sales Representative” / “Représentant aux ventes”; always rendered as `<title> \| GarageOS` (a typed “— GarageOS” suffix is normalised, never doubled) |
| Email | Identity from-address (validated) |
| Phone | Identity phone → falls back to the staff profile phone (optional; `tel:` link only for real numbers) |
| Website | Global setting `websiteUrl` (Super Admin, https) |
| “Book a demo” (optional) | The seller's own general booking link, only when online booking is on |
| Logo | Official `public/brand/logo-monochrome-dark.png` at `${NEXT_PUBLIC_APP_URL}/brand/logo-monochrome-dark.png` (480×160 asset shown at 120×40) |
Colors: Deep Navy `#07182F`, Primary Blue `#1769FF`, Off White `#F8FAFC`. Labels follow the **email** language (EN/FR).

## Rendering
Table layout, inline CSS, absolute HTTPS image URL, alt text, fixed image size; no JavaScript, external CSS, SVG or classes. Every employee value is HTML-escaped; links are rebuilt from validated parts (`mailto:` from a validated address, `tel:` from digits, http(s) only). A plain-text signature (`-- ` block) is always appended to the text part; with images blocked the name/title/contact lines remain real text.
**Required:** `NEXT_PUBLIC_APP_URL` must be the public **https** origin in Production (otherwise the logo URL is not https and the logo is omitted).

## Where it is applied
One boundary: `buildContent()` in `src/lib/sales-comms/content.ts`, used by new emails, replies, scheduled sends, template-based emails, sequence steps, post-demo follow-ups and meeting notices. Any signature already at the end of a draft/template (generated, `-- ` delimited, or a closing paragraph naming the sender) is removed first, so there is **exactly one**. The unsubscribe link / legal footer is a separate block and unchanged.

## Snapshot policy
A message captures its signature **when its body is rendered**: composed email → when the seller presses Send/Schedule (the previewed email is what goes out, even if scheduled later); sequence step → when that step is generated, just before dispatch (so edits between steps are picked up); meeting notices → at send time. A stored message is never rewritten.

## UI and authorization
“Email Signature Preview” / “Aperçu de la signature courriel” sits directly below the sender fields in **Sales settings → Communications → sender identity** and below the profile fields of **Sales team → member**; it updates as fields change and lists missing required fields (name, sender email). Only Super Admin can edit sender identities and staff profiles (unchanged authorization). The old free-text signature inputs are removed.

## Backward compatibility
`CrmSenderIdentity.signatureText` and `PlatformSalesStaff.signatureText` remain in the database, are no longer read or written, and sent messages keep their original bodies. No migration.
