#!/usr/bin/env python3
"""GarageOS National Lead Radar — Overture Maps Places extractor (local / CI batch runner).

Reads an extraction plan produced by GarageOS (Lead Radar → run → "Download plan"), queries the PUBLIC Overture Parquet files over
HTTP range requests (footer + only the row groups whose bbox statistics intersect the plan), keeps the plan's automotive taxonomy
codes, and writes deterministic NDJSON (schema v1) plus a manifest. It never writes to a database and holds no credentials.

  python3 scripts/lead-radar/overture_extract.py --plan plan.json --out ./out            # extract
  python3 scripts/lead-radar/overture_extract.py --plan plan.json --out ./out --dry-run  # workload estimate only (footers, no data)

Safety:
  * The only host contacted is the official Overture bucket (and the STAC catalog for release discovery). The plan cannot name URLs.
  * Bounded: --max-row-groups (default 800), --max-records (default 600000); row groups are read in small batches.
  * Restartable: one shard per source file, marked done; re-running with the same plan/release skips finished shards.
  * Deterministic: records sorted by id, keys sorted, so the same plan + release always yields the same file hash.
  * Only whitelisted fields are emitted (the raw record is never copied).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import sys
import time
from datetime import datetime, timezone

EXTRACTOR = "garageos-overture-extract"
EXTRACTOR_VERSION = "1.4.0"
BUCKET_HOST = "overturemaps-us-west-2.s3.amazonaws.com"
BUCKET_BASE = f"https://{BUCKET_HOST}/"
STAC_ROOT = "https://stac.overturemaps.org/catalog.json"
PLACES_PREFIX = "release/{release}/theme=places/type=place/"
RELEASE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}(\.\d{1,3})?$")
SCHEMA_VERSION = 1
POINT_BBOX_TOLERANCE = 1e-4

COLUMNS = ["id", "confidence", "names", "taxonomy", "brand", "addresses", "phones", "websites", "emails", "operating_status", "sources", "bbox"]


def log(msg: str) -> None:
    print(f"[lead-radar] {msg}", file=sys.stderr, flush=True)


# ── plan ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
def load_plan(path: str) -> dict:
    with open(path, encoding="utf-8") as fh:
        plan = json.load(fh)
    if plan.get("planVersion") != 1:
        raise SystemExit("unsupported planVersion")
    for key in ("planHash", "release", "bboxes", "taxonomyPrimaries", "hierarchyAny", "minConfidence"):
        if key not in plan:
            raise SystemExit(f"plan missing '{key}'")
    if not re.fullmatch(r"[0-9a-f]{64}", str(plan["planHash"])):
        raise SystemExit("invalid planHash")
    if plan["release"] != "latest" and not RELEASE_RE.match(str(plan["release"])):
        raise SystemExit("invalid release id")
    boxes = plan["bboxes"]
    if not boxes or len(boxes) > 13 or any(len(b) != 4 or not all(isinstance(v, (int, float)) for v in b) for b in boxes):
        raise SystemExit("invalid bboxes")
    return plan


# ── release discovery ──────────────────────────────────────────────────────────────────────────────────────────────────
def list_releases(requests) -> list[str]:
    """Bucket listing (verified reachable). Returns release ids sorted ascending."""
    r = requests.get(BUCKET_BASE, params={"list-type": "2", "prefix": "release/", "delimiter": "/"}, timeout=30)
    r.raise_for_status()
    found = re.findall(r"<Prefix>release/([^/<]+)/</Prefix>", r.text)
    return sorted(x for x in found if RELEASE_RE.match(x))


def resolve_release(requested: str, requests) -> str:
    if requested != "latest":
        return requested
    # Preferred, official: the STAC catalog advertises the newest release. Best effort: fall back to the bucket listing.
    try:
        cat = requests.get(STAC_ROOT, timeout=20).json()
        latest = cat.get("latest")
        if isinstance(latest, str) and RELEASE_RE.match(latest):
            return latest
    except Exception as exc:  # noqa: BLE001 - discovery must never hard-fail on the catalog
        log(f"STAC unavailable ({type(exc).__name__}); falling back to bucket listing")
    releases = list_releases(requests)
    if not releases:
        raise SystemExit("no Overture releases found")
    return releases[-1]


def list_part_files(release: str, requests) -> list[str]:
    keys: list[str] = []
    token = None
    while True:
        params = {"list-type": "2", "prefix": PLACES_PREFIX.format(release=release)}
        if token:
            params["continuation-token"] = token
        r = requests.get(BUCKET_BASE, params=params, timeout=30)
        r.raise_for_status()
        keys += re.findall(r"<Key>([^<]+\.parquet)</Key>", r.text)
        m = re.search(r"<NextContinuationToken>([^<]+)</NextContinuationToken>", r.text)
        if not m:
            break
        token = m.group(1)
    return sorted(keys)


# ── pure helpers (unit-tested) ─────────────────────────────────────────────────────────────────────────────────────────
def boxes_intersect(a, b) -> bool:
    return not (a[2] < b[0] or a[0] > b[2] or a[3] < b[1] or a[1] > b[3])


def point_in_any(x: float, y: float, boxes) -> bool:
    return any(b[0] <= x <= b[2] and b[1] <= y <= b[3] for b in boxes)


def wants(row: dict, plan: dict) -> bool:
    tax = row.get("taxonomy") or {}
    primary = tax.get("primary")
    hierarchy = tax.get("hierarchy") or []
    if primary in set(plan["taxonomyPrimaries"]):
        pass
    elif any(h in set(plan["hierarchyAny"]) for h in hierarchy):
        pass
    else:
        return False
    if (row.get("confidence") or 0) < float(plan["minConfidence"]):
        return False
    addr = (row.get("addresses") or [None])[0] or {}
    country = (addr.get("country") or "").upper()
    return country in ("CA", "")  # unknown country is kept; GarageOS decides (postal/region) and rejects non-Canadian rows


def source_point(row: dict):
    """Overture places are POINT features, so their `bbox` collapses to the point itself (xmin == xmax, ymin == ymax). Returns
    {"lat", "lng"} only for such a degenerate bbox with finite, in-range values; anything else (a polygon-like box, nulls) yields None.
    Nothing is invented: a row without a trustworthy point simply carries no coordinates."""
    b = row.get("bbox") or {}
    try:
        x0, x1, y0, y1 = (float(b[k]) for k in ("xmin", "xmax", "ymin", "ymax"))
    except (KeyError, TypeError, ValueError):
        return None
    if not all(math.isfinite(v) for v in (x0, x1, y0, y1)):
        return None
    # Overture stores bbox as float32 values widened to double, so for a POINT xmax - xmin is not 0 but one float32 step (~7.6e-6 deg near Montréal; measured on
    # release 2026-09-23.1). A tolerance of 1e-6 (extractor 1.1.0) rejected every place. 1e-4 deg (~10 m) is far above float32 rounding and far below any real
    # polygon-like box, and the midpoint is within ~0.4 m of the true point.
    if abs(x1 - x0) > POINT_BBOX_TOLERANCE or abs(y1 - y0) > POINT_BBOX_TOLERANCE:
        return None
    lng, lat = (x0 + x1) / 2, (y0 + y1) / 2
    if not (-180 <= lng <= 180 and -90 <= lat <= 90):
        return None
    return {"lat": round(lat, 7), "lng": round(lng, 7)}


def _clip(v, n):
    return str(v)[:n] if v is not None else None


def source_item(s: dict) -> dict:
    """Whitelisted projection of one Overture `sources[]` item (property, dataset, license, record_id, update_time, confidence)."""
    conf = s.get("confidence")
    return {
        "property": _clip(s.get("property"), 120) or "",
        "dataset": _clip(s.get("dataset"), 80),
        "license": _clip(s.get("license"), 60),
        "recordId": _clip(s.get("record_id"), 120),
        "updateTime": _clip(s.get("update_time"), 40),
        "confidence": float(conf) if isinstance(conf, (int, float)) and 0 <= conf <= 1 else None,
    }


def to_record(row: dict) -> dict:
    """Whitelisted, schema-v1 projection. Nothing outside this list is ever written."""
    tax = row.get("taxonomy") or {}
    addr = (row.get("addresses") or [None])[0] or {}
    names = row.get("names") or {}
    brand = row.get("brand") or {}
    return {
        "v": SCHEMA_VERSION,
        "id": row["id"],
        "confidence": row.get("confidence"),
        "name": names.get("primary"),
        "taxonomy": {"primary": tax.get("primary"), "hierarchy": list(tax.get("hierarchy") or [])[:8], "alternates": list(tax.get("alternates") or [])[:12]},
        "brandWikidata": brand.get("wikidata"),
        "operatingStatus": row.get("operating_status"),
        "address": {k: addr.get(k) for k in ("freeform", "locality", "postcode", "region", "country")},
        "phones": list(row.get("phones") or [])[:3],
        "websites": list(row.get("websites") or [])[:3],
        "emails": list(row.get("emails") or [])[:3],
        "sources": [{"dataset": s.get("dataset"), "license": s.get("license")} for s in (row.get("sources") or [])][:20],
        # Additive (v1.4.0): the per-property attribution Overture publishes (JSON-pointer `property`, dataset, license, dataset-specific record id, source update time, source confidence).
        # Nothing is invented and nothing else of the source item is copied. An item whose property points at /emails is email-level provenance; the root item ("") is place-level only.
        "sourceItems": [source_item(s) for s in (row.get("sources") or [])][:30],
        # Additive (schema v1 stays valid): the place's own point, so GarageOS never has to geocode what the source already located.
        "geo": source_point(row),
    }


def dump_line(rec: dict) -> str:
    return json.dumps(rec, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


# ── extraction ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def row_group_hits(md, idx, boxes) -> list[int]:
    hits = []
    for g in range(md.num_row_groups):
        rg = md.row_group(g)

        def stat(col):
            s = rg.column(idx[col]).statistics
            return (s.min, s.max) if s is not None and s.has_min_max else (None, None)

        xmin, _ = stat("bbox.xmin")
        _, xmax = stat("bbox.xmax")
        ymin, _ = stat("bbox.ymin")
        _, ymax = stat("bbox.ymax")
        if None in (xmin, xmax, ymin, ymax):
            hits.append(g)  # no statistics: cannot prune safely
            continue
        if any(boxes_intersect((xmin, ymin, xmax, ymax), b) for b in boxes):
            hits.append(g)
    return hits


def extract_shard(pf, hits, boxes, plan, batch, tmp) -> dict:
    """Reads the given row groups of one Parquet file and writes the plan's records to `tmp` (NDJSON). Returns per-shard counters:
    examined = rows read, emitted = rows kept, withPoint = emitted rows carrying a valid source point. Pure with respect to the network:
    `pf` is any pyarrow.parquet.ParquetFile (remote in production, a local file in tests)."""
    examined = emitted = with_point = 0
    with open(tmp, "w", encoding="utf-8") as out:
        for i in range(0, len(hits), batch):
            table = pf.read_row_groups(hits[i:i + batch], columns=COLUMNS)
            for row in table.to_pylist():
                examined += 1
                b = row.get("bbox") or {}
                if b.get("xmin") is None or not point_in_any(b["xmin"], b["ymin"], boxes):
                    continue
                if not wants(row, plan):
                    continue
                rec = to_record(row)
                if rec["geo"] is not None:
                    with_point += 1
                out.write(dump_line(rec) + "\n")
                emitted += 1
    return {"examined": examined, "emitted": emitted, "withPoint": with_point}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--plan", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--release", help="override the plan's release (must match the id pattern)")
    ap.add_argument("--dry-run", action="store_true", help="read Parquet footers only and print the workload")
    ap.add_argument("--max-row-groups", type=int, default=800)
    ap.add_argument("--max-records", type=int, default=600_000)
    ap.add_argument("--batch", type=int, default=6, help="row groups read per batch (memory bound)")
    ap.add_argument("--points-only", action="store_true", help="write points.ndjson ({id,lat,lng} per place) for the Super Admin 'Refresh positions' upload instead of records.ndjson + manifest.json")
    args = ap.parse_args()

    import fsspec  # imported lazily so unit tests of the pure helpers need no network libraries
    import pyarrow.parquet as pq
    import requests

    plan = load_plan(args.plan)
    release = resolve_release(args.release or plan["release"], requests)
    if not RELEASE_RE.match(release):
        raise SystemExit("invalid release id")
    boxes = plan["bboxes"]
    files = list_part_files(release, requests)
    if not files:
        raise SystemExit(f"no places files for release {release}")
    log(f"release {release}: {len(files)} part files; plan {plan['planHash'][:12]}…")

    fs = fsspec.filesystem("https")
    os.makedirs(os.path.join(args.out, "parts"), exist_ok=True)
    stats = {"files": len(files), "rowGroupsScanned": 0, "rowGroupsTotal": 0, "rowsExamined": 0, "rowsEmitted": 0, "estimatedMB": 0}
    shard_paths: list[str] = []
    started = time.time()

    for n, key in enumerate(files):
        # The extractor version is part of the shard identity: shards written by an older extractor (e.g. 1.0.0/1.1.0, no usable points) are never reused.
        shard = os.path.join(args.out, "parts", f"{release}.{plan['planHash'][:12]}.v{EXTRACTOR_VERSION}.{n:05d}.ndjson")
        shard_paths.append(shard)
        done = shard + ".done"
        f = fs.open(BUCKET_BASE + key, block_size=16 * 1024 * 1024)  # URL built from the fixed bucket + a listed key only
        pf = pq.ParquetFile(f)
        md = pf.metadata
        idx = {md.schema.column(i).path: i for i in range(md.num_columns)}
        hits = row_group_hits(md, idx, boxes)
        stats["rowGroupsTotal"] += md.num_row_groups
        stats["rowGroupsScanned"] += len(hits)
        stats["estimatedMB"] += int(sum(md.row_group(g).total_byte_size for g in hits) / 1e6)
        if args.dry_run or os.path.exists(done):
            if os.path.exists(done) and not args.dry_run:
                log(f"[{n + 1}/{len(files)}] shard already complete, skipping")
                try:
                    with open(done, encoding="utf-8") as fh:
                        prev = json.load(fh)
                    stats["rowsExamined"] += int(prev.get("examined", 0))
                    stats["rowsEmitted"] += int(prev.get("emitted", 0))
                except (ValueError, OSError):
                    pass  # an old empty marker: counters unknown, never invented
            continue
        if stats["rowGroupsScanned"] > args.max_row_groups:
            raise SystemExit(f"workload exceeds --max-row-groups ({args.max_row_groups}); narrow the plan or raise the limit deliberately")
        tmp = shard + ".tmp"
        c = extract_shard(pf, hits, boxes, plan, args.batch, tmp)
        os.replace(tmp, shard)
        with open(done, "w", encoding="utf-8") as fh:
            json.dump(c, fh)  # per-shard counters survive a resume, so a resumed run still reports what it really read
        for k_, v_ in (("rowsExamined", "examined"), ("rowsEmitted", "emitted")):
            stats[k_] += c[v_]
        log(f"[{n + 1}/{len(files)}] {len(hits)} row groups → {c['emitted']} records ({int(time.time() - started)}s)")

    if args.dry_run:
        print(json.dumps({"release": release, **stats}, indent=2))
        return 0

    # Merge shards deterministically (sorted by id, de-duplicated).
    records: dict[str, str] = {}
    points: dict[str, tuple[float, float]] = {}
    for p in shard_paths:
        if not os.path.exists(p):
            continue
        with open(p, encoding="utf-8") as fh:
            for line in fh:
                obj = json.loads(line)
                rid = obj["id"]
                g = obj.get("geo")
                if g and g.get("lat") is not None and g.get("lng") is not None:
                    points[rid] = (g["lat"], g["lng"])
                records[rid] = line.rstrip("\n")
                if len(records) > args.max_records:
                    raise SystemExit(f"more than --max-records ({args.max_records}) records; narrow the plan")
    stats["recordsWithPoint"] = len(points)
    stats["pointsMissing"] = len(records) - len(points)
    # Read nothing at all although the plan matched row groups: the file layout or the read path is broken, not the province.
    if stats["rowGroupsScanned"] > 0 and stats["rowsExamined"] == 0:
        raise SystemExit(f"0 rows were read from {stats['rowGroupsScanned']} matching row groups. Refusing to write an extraction that read nothing (extractor {EXTRACTOR_VERSION}).")
    # Never report a successful extraction whose coordinates failed: GarageOS needs these points to place shops on the map without a paid geocoder.
    if records and not points:
        raise SystemExit(f"0 of {len(records)} records carry a source point. Refusing to write a coordinate-less extraction "
                         f"(extractor {EXTRACTOR_VERSION}); delete the output folder's parts/ directory and report this.")
    log(f"source points: {len(points)} of {len(records)} records")
    if args.points_only:
        pp = os.path.join(args.out, "points.ndjson")
        with open(pp, "w", encoding="utf-8", newline="\n") as out:
            for rid in sorted(points):
                out.write(json.dumps({"id": rid, "lat": points[rid][0], "lng": points[rid][1]}, separators=(",", ":")) + "\n")
        log(f"done: {len(points)} points → {pp}")
        return 0
    out_path = os.path.join(args.out, "records.ndjson")
    sha = hashlib.sha256()
    with open(out_path, "w", encoding="utf-8", newline="\n") as out:
        for rid in sorted(records):
            line = records[rid] + "\n"
            out.write(line)
            sha.update(line.encode("utf-8"))
    manifest = {
        "extractor": EXTRACTOR, "extractorVersion": EXTRACTOR_VERSION, "planHash": plan["planHash"], "release": release,
        "recordCount": len(records), "fileSha256": sha.hexdigest(), "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "stats": {k: v for k, v in stats.items() if isinstance(v, int)},
    }
    with open(os.path.join(args.out, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2, sort_keys=True)
    log(f"done: {len(records)} records → {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
