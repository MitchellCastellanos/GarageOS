// Cross-language contract: records produced by the REAL Python extractor (to_record) from rows shaped like real Overture rows (bbox = float32 widened to double,
// values measured on release 2026-09-23.1) must be accepted by the TypeScript staging normaliser with a source point. This is the test that was missing when
// extractor 1.1.0 (tolerance 1e-6) silently produced zero points for every place while all unit tests (exact-equal bbox fixtures) passed.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { toCandidate } from "../src/domain/lead-radar/record";
import { cityKey } from "../src/domain/sales-crm/territory";

const root = path.resolve(import.meta.dirname, "..");
const py = spawnSync("python3", ["--version"]).status === 0;

const PY = `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.join(root, "scripts", "lead-radar"))})
import overture_extract as ex
def row(i, name, bbox, region="QC", pc="H2X 1Y4", city="Montréal"):
    return {"id": "00000000-0000-4000-8000-%012d" % i, "confidence": 0.9, "names": {"primary": name},
            "taxonomy": {"primary": "automotive_repair", "hierarchy": ["travel_and_transportation", "vehicle_service"], "alternates": []},
            "brand": None, "addresses": [{"freeform": "%d Rue Test" % (100+i), "locality": city, "postcode": pc, "region": region, "country": "CA"}],
            "phones": ["+1514555%04d" % i], "websites": [], "emails": [], "operating_status": None, "sources": [{"dataset": "meta", "license": "CDLA-Permissive-2.0"}], "bbox": bbox}
rows = [
  row(1, "Real float32 point A", {"xmin": -73.56170654296875, "xmax": -73.56169891357422, "ymin": 45.508811950683594, "ymax": 45.50881958007812}),
  row(2, "Real float32 point B", {"xmin": -74.17697143554688, "xmax": -74.17696380615234, "ymin": 45.34060287475586, "ymax": 45.34061050415039}),
  row(3, "Exact point", {"xmin": -73.6, "xmax": -73.6, "ymin": 45.5, "ymax": 45.5}),
  row(4, "Not a point (polygon-like box)", {"xmin": -73.7, "xmax": -73.6, "ymin": 45.5, "ymax": 45.6}),
  row(5, "No bbox", None),
  row(6, "Point outside the province (Calgary on a Québec address)", {"xmin": -114.07, "xmax": -114.06999, "ymin": 51.05, "ymax": 51.05001}),
]
for r in rows: print(json.dumps(ex.to_record(r), sort_keys=True, ensure_ascii=False, separators=(",", ":")))
`;

test("extractor output for real-shaped Overture rows carries source points that staging accepts (contract)", { skip: !py && "python3 not available" }, () => {
  const out = spawnSync("python3", ["-I", "-c", PY], { encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr);
  const recs = out.stdout.trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(recs.length, 6);
  const cand = recs.map((r) => { const x = toCandidate(r, { provinces: [] }, { cityKeyOf: cityKey }); assert.ok(x.ok, JSON.stringify(x)); return x.candidate; });
  // the two real float32 points and the exact point are stored; coordinates are accurate to well under a metre
  assert.ok(cand[0].sourceLatitude !== null && Math.abs(cand[0].sourceLatitude! - 45.5088158) < 1e-5 && Math.abs(cand[0].sourceLongitude! - -73.5617027) < 1e-5);
  assert.ok(cand[1].sourceLatitude !== null && cand[2].sourceLatitude === 45.5);
  // a polygon-like box and a missing bbox carry no point (nothing invented); the reason is reported, not hidden
  assert.deepEqual([cand[3].sourceLatitude, cand[3].sourcePointIssue], [null, "NO_SOURCE_COORDINATES"]);
  assert.deepEqual([cand[4].sourceLatitude, cand[4].sourcePointIssue], [null, "NO_SOURCE_COORDINATES"]);
  // a point that is outside the business's province is rejected, with the reason
  assert.deepEqual([cand[5].sourceLatitude, cand[5].sourcePointIssue], [null, "OUT_OF_PROVINCE"]);
});
