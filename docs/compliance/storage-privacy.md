# Storage privacy architecture

| Class | Bucket | Visibility | Contents | Access |
|---|---|---|---|---|
| Public | `public-assets` | public, images only, 5 MB | `logos/{shopId}/…`, `booking-page/{shopId}/…` | permanent public URL (only these prefixes are accepted by `publicAssetUrl`) |
| Private | `accounting` | private | `{shopId}/invoice-share/`, `{shopId}/invoice-payments/`, `{shopId}/paid-invoices/`, `{shopId}/{accounting category}/`, `{shopId}/inspections/` | server download or signed URL after authorization |
| Private | `communications` | private | `{shopId}/{messageId}/…` | signed URL after shop authorization |

Rules: DB columns store storage paths (`Invoice.pdfUrl` holds a private path despite its legacy name), never signed or public URLs for private files. Private helpers take `shopId` and reject paths outside `{shopId}/`. No code outside `src/lib/storage.ts` may call `getPublicUrl` (enforced by `tests/storage-privacy.test.ts`). Private read/sign helpers (`downloadPrivateDocument`, `signedUrlForPrivateDocument`, `signedUrlForCommunicationAttachment`) fail closed: after tenant-path validation they refuse to operate if the private bucket is public, is missing, or its visibility cannot be verified (uploads already did). A verified-private result is cached for 60 s per bucket; failures are never cached, so a bucket accidentally made public blocks reads within one minute. The codebase guard forbids constructing `/object/public/accounting/` URLs everywhere except an exact allow-list of the two legacy-URL files (`src/lib/storage-paths.ts`, `src/lib/storage-migration.ts`), and the guard is itself tested against synthetic offenders. Customer access: invoice download link and Customer Portal PDFs are streamed by the server after token checks; shared DVI photos redirect (60 s signed URL) after report-token and plan checks.

## Migration runbook (existing data)
Dry-run semantics: copies that `--apply` would perform are reported as `planned` (expected on the first dry-run; the two legacy logos in Production). `unresolved` counts real problems only (source object missing, path of another shop, failed download/upload/verify, unrecognised URL). Finalize is refused unless planned, unresolved and public-reference counts are all zero after apply. Logic lives in `src/lib/storage-migration.ts`, covered by `tests/storage-migration.test.ts`.

1. `npx tsx scripts/migrate-storage-privacy.ts` (dry-run): lists objects, planned logo/booking-image copies, unreferenced or missing objects.
2. Deploy the release, then `--apply`: copies public assets to `public-assets` (size-verified), rewrites `Shop.logoUrl` / `bookingCoverImageUrl` / `bookingShopImageUrl` and legacy `Invoice.pdfUrl`.
3. `--apply --finalize`: makes `accounting` private (refuses if any DB row still points at a public `accounting` URL).
4. Later, after a bake period, `--apply --delete-public-copies` removes only verified duplicate logo/booking objects from `accounting`.
The script never deletes an object because a DB reference is unresolved, and is safe to re-run.

## Production migration record (2026-09-30)
The Production storage privacy migration was completed and verified. This record contains no customer data or object identifiers.

- `--apply` copied the legacy public assets (shop logos) to `public-assets`, size-verified, and rewrote the affected `Shop` URL columns; a following dry-run reported nothing planned and nothing unresolved.
- `--apply --finalize` made the `accounting` bucket **private**. Afterwards no database row referenced a public `accounting` URL, and all private database references resolved to existing objects.
- Unauthenticated requests to former public URLs of private objects (invoice documents) are **denied** (HTTP 400, no content returned).
- Public assets remain accessible from `public-assets` (HTTP 200); the same paths through the old public `accounting` URL are denied.
- Server-side private retrieval and short-lived signed URLs were verified against existing private objects; cross-tenant paths are rejected before any provider call.
- Portal, shared DVI photo and payment-receipt/accounting-document flows were **not exercised end to end in Production**: no safe existing data was available for them (no DVI photos, receipts or accounting documents exist yet) and a portal end-to-end check would require issuing a link and sending an email. They are **code-path verified and unit-tested only**; run a Production end-to-end check when the first real objects exist.
- The two legacy duplicate public-asset objects are intentionally retained in `accounting` for now, for rollback/safety. They are **not publicly accessible**, because the bucket is private. `--delete-public-copies` has not been run and is deferred until after a bake period.
