# Storage privacy architecture

| Class | Bucket | Visibility | Contents | Access |
|---|---|---|---|---|
| Public | `public-assets` | public, images only, 5 MB | `logos/{shopId}/…`, `booking-page/{shopId}/…` | permanent public URL (only these prefixes are accepted by `publicAssetUrl`) |
| Private | `accounting` | private | `{shopId}/invoice-share/`, `{shopId}/invoice-payments/`, `{shopId}/paid-invoices/`, `{shopId}/{accounting category}/`, `{shopId}/inspections/` | server download or signed URL after authorization |
| Private | `communications` | private | `{shopId}/{messageId}/…` | signed URL after shop authorization |

Rules: DB columns store storage paths (`Invoice.pdfUrl` holds a private path despite its legacy name), never signed or public URLs for private files. Private helpers take `shopId` and reject paths outside `{shopId}/`. No code outside `src/lib/storage.ts` may call `getPublicUrl` (enforced by `tests/storage-privacy.test.ts`). Customer access: invoice download link and Customer Portal PDFs are streamed by the server after token checks; shared DVI photos redirect (60 s signed URL) after report-token and plan checks.

## Migration runbook (existing data)
Dry-run semantics: copies that `--apply` would perform are reported as `planned` (expected on the first dry-run; the two legacy logos in Production). `unresolved` counts real problems only (source object missing, path of another shop, failed download/upload/verify, unrecognised URL). Finalize is refused unless planned, unresolved and public-reference counts are all zero after apply. Logic lives in `src/lib/storage-migration.ts`, covered by `tests/storage-migration.test.ts`.

1. `npx tsx scripts/migrate-storage-privacy.ts` (dry-run): lists objects, planned logo/booking-image copies, unreferenced or missing objects.
2. Deploy the release, then `--apply`: copies public assets to `public-assets` (size-verified), rewrites `Shop.logoUrl` / `bookingCoverImageUrl` / `bookingShopImageUrl` and legacy `Invoice.pdfUrl`.
3. `--apply --finalize`: makes `accounting` private (refuses if any DB row still points at a public `accounting` URL).
4. Later, after a bake period, `--apply --delete-public-copies` removes only verified duplicate logo/booking objects from `accounting`.
The script never deletes an object because a DB reference is unresolved, and is safe to re-run.
