# Mapbox geocoding & map — runbook

> **Update (Lead Radar geolocation):** prospects imported by Lead Radar are now located for free from the Overture point (see `docs/lead-radar/geolocation.md`). Mapbox is only the fallback for prospects without a source position. Once enabled here, the Lead Radar worker may also run small bounded batches (≤ 25 per tick) within the same budget; bad credentials switch geocoding off.

## What was integrated
- **Geocoding API v6 forward**, server-side only (`src/lib/sales-crm/geocoder.ts`), always `permanent=true`, `country=ca`, `autocomplete=false`, `limit=3`. Temporary results are never requested, so nothing non-storable is stored.
- Stored in the existing `CrmProspectLocation` (provider `mapbox-permanent-v6`). Coordinates exist only for decisive answers: confidence (from Mapbox `match_code`, capped when civic number / postal code / city did not match), navigable accuracy, Canada bounding box, and no rival match >250 m away. Everything else is stored **without** coordinates (AMBIGUOUS / INVALID / ERROR) and listed for manual review.
- **Not geocoded (no request spent):** inactive, DNC, merged, archived, unassigned prospects, and addresses without a civic number, or without city/postal code.
- **Cost controls:** env kill-switch + DB `enabled` flag + owner `maxRequests` ceiling (lifetime total, ≤ `GEOCODING_MAX_REQUESTS_HARD_CAP`, default 500) reserved atomically *before* each request; one batch at a time (lease); batches ≤ 25 (test ≤ 5); each prospect with a decisive answer for its current address is never requested again; failures are retried only on explicit request (max 3 attempts). Rejected credentials or a rate limit stop the batch immediately.
- **Authorization:** capability `manage_geocoding` — Super Admin only; every action re-resolves the actor. CRM prospects are platform records, not tenant shop data. Counts-only audit events (`GEOCODING_SETTINGS_CHANGED`, `GEOCODING_BATCH_RUN`).
- **Map:** existing MapLibre integration with Mapbox raster tiles (Static Tiles API), public `pk.` token only, Mapbox + OpenStreetMap attribution. No routing/driving time is integrated; distances remain labelled straight-line.
- **Migration** `20261014090000_mapbox_geocoding_controls`: additive, one empty table `CrmGeocodingSettings` (disabled, budget 0 until a Super Admin saves).

## Environment variables (Vercel → Production only when ready)
| Name | Secret? | Value |
|---|---|---|
| `GEOCODING_PROVIDER` | no | `mapbox` |
| `MAPBOX_GEOCODING_TOKEN` | **yes, server-only** | Mapbox **secret** token (`sk.…`) with Permanent Geocoding available on the account. Never `NEXT_PUBLIC_*`. |
| `MAPBOX_GEOCODING_ENABLED` | no | `true` to allow runs (omit/`false` = off) |
| `GEOCODING_MAX_REQUESTS_HARD_CAP` | no | optional, default `500` |
| `MAP_PROVIDER` | no | `mapbox` |
| `MAPBOX_PUBLIC_TOKEN` | public by design | Mapbox **public** token (`pk.…`), **URL-restricted** to the GarageOS production + preview domains, scope `styles:tiles` only |
| `MAPBOX_MAP_STYLE` | no | optional, default `mapbox/streets-v12` |

## Super Admin procedure for the GABAN prospects
1. Deploy; open **Geocoding** in the sales sidebar. Provider status must read "Mapbox geocoding is available".
2. Read the preview: it makes no request. Expect ≈96 eligible; "To locate" = estimated requests; check "Address incomplete" (fix those on the prospect first).
3. Set controls: tick *enabled*, set the maximum (e.g. 150 = 96 + margin), save.
4. Click **Run test batch (up to 5)**; open the Field Planner and verify the 5 pins are at the right shops.
5. Click **Locate next batch (up to 25)** repeatedly until "To locate" is 0 (≈4 clicks). Stop on any "Stopped:" message.
6. Work the **Manual review** list: open the prospect, fix the address, next batch locates it; use *Retry* only for temporary errors.
7. When done, untick *enabled* and save (or unset `MAPBOX_GEOCODING_ENABLED`).

## Production verification checklist
- [ ] Migration applied; `/platform/sales/settings/geocoding` is 403/denied for a rep and manager, visible for Super Admin.
- [ ] Status shows LIVE only after env vars set; with the token removed it shows "missing credentials" and buttons are disabled.
- [ ] Test batch → pins correct; requests used = 5 (compare with Mapbox usage dashboard).
- [ ] Re-running a batch with nothing to locate spends 0 requests.
- [ ] Ambiguous rows have no coordinates; planner shows them "Address is ambiguous".
- [ ] Field Planner (EN and FR) shows grey markers + basemap attribution; route save/start/visit unchanged; distance still labelled straight-line.
- [ ] Browser bundle/network contains only the `pk.` token, never `sk.`.
- [ ] Mapbox account: billing/limits reviewed by the owner; confirm current Mapbox terms on wordmark/attribution for raster tiles.
