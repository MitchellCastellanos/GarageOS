"""Unit tests for the pure parts of overture_extract.py (no network). Run: python3 -m unittest scripts/lead-radar/test_extract.py"""
import importlib.util, os, unittest

spec = importlib.util.spec_from_file_location("ex", os.path.join(os.path.dirname(__file__), "overture_extract.py"))
ex = importlib.util.module_from_spec(spec); spec.loader.exec_module(ex)

PLAN = {"taxonomyPrimaries": ["automotive_repair"], "hierarchyAny": ["vehicle_service"], "minConfidence": 0.3, "bboxes": [[-74.05, 45.35, -73.4, 45.75]]}
ROW = {"id": "abc-12345678", "confidence": 0.9, "names": {"primary": "Garage X"}, "taxonomy": {"primary": "automotive_repair", "hierarchy": ["a", "vehicle_service"], "alternates": None},
       "addresses": [{"freeform": "1 Rue A", "locality": "Montréal", "postcode": "H2X1Y4", "region": "QC", "country": "CA"}], "phones": ["+15145550100"], "websites": None, "emails": None,
       "sources": [{"dataset": "meta", "license": "CDLA-Permissive-2.0", "record_id": "SECRET-UPSTREAM", "update_time": "x"}], "brand": None, "operating_status": None, "bbox": {"xmin": -73.6, "xmax": -73.6, "ymin": 45.5, "ymax": 45.5}}

class T(unittest.TestCase):
    def test_wants_by_primary_and_hierarchy(self):
        self.assertTrue(ex.wants(ROW, PLAN))
        other = {**ROW, "taxonomy": {"primary": "brand_new_code", "hierarchy": ["x", "vehicle_service"]}}
        self.assertTrue(ex.wants(other, PLAN))   # unknown subcategory under vehicle_service is kept for human review
        self.assertFalse(ex.wants({**ROW, "taxonomy": {"primary": "gas_station", "hierarchy": ["fueling_station"]}}, PLAN))
    def test_confidence_and_country(self):
        self.assertFalse(ex.wants({**ROW, "confidence": 0.1}, PLAN))
        self.assertFalse(ex.wants({**ROW, "addresses": [{"country": "US"}]}, PLAN))
        self.assertTrue(ex.wants({**ROW, "addresses": [{"country": None}]}, PLAN))
    def test_projection_is_whitelisted(self):
        rec = ex.to_record(ROW)
        self.assertEqual(rec["sources"], [{"dataset": "meta", "license": "CDLA-Permissive-2.0"}])
        self.assertNotIn("SECRET-UPSTREAM", ex.dump_line(rec))
        self.assertEqual(rec["v"], 1)
    def test_source_point_from_degenerate_bbox(self):
        self.assertEqual(ex.to_record(ROW)["geo"], {"lat": 45.5, "lng": -73.6})
    def test_source_point_accepts_float32_widened_bbox_of_a_real_place(self):
        # Measured on Overture release 2026-09-23.1: bbox is float32 widened to double, so a POINT has xmax - xmin = one float32 step (~7.6e-6 deg).
        real = {**ROW, "bbox": {"xmin": -74.17697143554688, "xmax": -74.17696380615234, "ymin": 45.34060287475586, "ymax": 45.34061050415039}}
        g = ex.source_point(real)
        self.assertIsNotNone(g, "extractor 1.1.0 (tolerance 1e-6) returned None for every real place")
        self.assertAlmostEqual(g["lat"], 45.3406067, places=5); self.assertAlmostEqual(g["lng"], -74.1769676, places=5)
        self.assertIsNone(ex.source_point({**ROW, "bbox": {"xmin": -74.2, "xmax": -74.199, "ymin": 45.3, "ymax": 45.3}}))  # ~80 m wide: a real box, not a point
    def test_shard_identity_includes_the_extractor_version(self):
        self.assertRegex(ex.EXTRACTOR_VERSION, r"^\d+\.\d+\.\d+$")
        self.assertNotIn(ex.EXTRACTOR_VERSION, ("1.0.0", "1.1.0"))
    def test_source_point_rejects_non_points_and_garbage(self):
        box = lambda **k: {**ROW, "bbox": {"xmin": -73.6, "xmax": -73.6, "ymin": 45.5, "ymax": 45.5, **k}}
        self.assertIsNone(ex.source_point(box(xmax=-73.5)))          # a real box is not a point
        self.assertIsNone(ex.source_point(box(ymax=46.5)))
        self.assertIsNone(ex.source_point({**ROW, "bbox": None}))
        self.assertIsNone(ex.source_point({**ROW, "bbox": {"xmin": None, "xmax": None, "ymin": None, "ymax": None}}))
        self.assertIsNone(ex.source_point(box(xmin=float("nan"), xmax=float("nan"))))
        self.assertIsNone(ex.source_point(box(ymin=95, ymax=95)))    # out of range
        self.assertIsNone(ex.to_record({**ROW, "bbox": {"xmin": -73.6}})["geo"])
    def test_dump_is_deterministic(self):
        self.assertEqual(ex.dump_line(ex.to_record(ROW)), ex.dump_line(ex.to_record(dict(reversed(list(ROW.items()))))))
    def test_bbox_helpers(self):
        self.assertTrue(ex.boxes_intersect((-74, 45.4, -73.5, 45.6), PLAN["bboxes"][0]))
        self.assertFalse(ex.boxes_intersect((-120, 50, -110, 55), PLAN["bboxes"][0]))
        self.assertTrue(ex.point_in_any(-73.6, 45.5, PLAN["bboxes"]))
        self.assertFalse(ex.point_in_any(-80, 45.5, PLAN["bboxes"]))
    def test_plan_validation(self):
        import tempfile, json
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
            json.dump({"planVersion": 1, "planHash": "x", "release": "latest", "bboxes": [[0, 0, 1, 1]], "taxonomyPrimaries": [], "hierarchyAny": [], "minConfidence": 0}, fh)
        with self.assertRaises(SystemExit): ex.load_plan(fh.name)   # bad hash
        with open(fh.name, "w") as f2:
            json.dump({"planVersion": 1, "planHash": "a" * 64, "release": "../../etc", "bboxes": [[0, 0, 1, 1]], "taxonomyPrimaries": [], "hierarchyAny": [], "minConfidence": 0}, f2)
        with self.assertRaises(SystemExit): ex.load_plan(fh.name)   # release id cannot smuggle a path/URL


# ── Realistic Overture structures (pyarrow, local file): the layout the production Parquet files really have ──────────────────────────────────────────────────
try:
    import pyarrow as pa
    import pyarrow.parquet as pq
except ImportError:  # the pure tests above still run without pyarrow
    pa = pq = None


def overture_table(rows):
    """Builds a table with the real Overture `places` column types: bbox is struct<float32 x4> (this is what produced the 1.1.0 coordinate loss)."""
    f32 = pa.float32()
    schema = pa.schema([
        ("id", pa.string()), ("geometry", pa.binary()), ("bbox", pa.struct([("xmin", f32), ("xmax", f32), ("ymin", f32), ("ymax", f32)])),
        ("confidence", pa.float64()), ("names", pa.struct([("primary", pa.string()), ("common", pa.map_(pa.string(), pa.string()))])),
        ("taxonomy", pa.struct([("primary", pa.string()), ("hierarchy", pa.list_(pa.string())), ("alternates", pa.list_(pa.string()))])),
        ("brand", pa.struct([("wikidata", pa.string())])),
        ("addresses", pa.list_(pa.struct([("freeform", pa.string()), ("locality", pa.string()), ("postcode", pa.string()), ("region", pa.string()), ("country", pa.string())]))),
        ("phones", pa.list_(pa.string())), ("websites", pa.list_(pa.string())), ("emails", pa.list_(pa.string())), ("operating_status", pa.string()),
        ("sources", pa.list_(pa.struct([("property", pa.string()), ("dataset", pa.string()), ("license", pa.string()), ("record_id", pa.string()), ("update_time", pa.string())]))),
    ])
    cols = {n: [] for n in schema.names}
    for r in rows:
        lng, lat = r["pt"]
        cols["id"].append(r["id"]); cols["geometry"].append(b"\x01\x01\x00\x00\x00")
        cols["bbox"].append({"xmin": lng, "xmax": lng, "ymin": lat, "ymax": lat})  # float32 narrowing happens in Arrow, exactly like the real files
        cols["confidence"].append(r.get("confidence", 0.9)); cols["names"].append({"primary": r["name"], "common": None})
        cols["taxonomy"].append({"primary": r.get("primary", "automotive_repair"), "hierarchy": ["travel_and_transportation", "vehicle_service", "automotive_repair"], "alternates": None})
        cols["brand"].append(None)
        cols["addresses"].append([{"freeform": r["street"], "locality": r["city"], "postcode": r["postcode"], "region": r["region"], "country": r.get("country", "CA")}])
        cols["phones"].append(["+15145550100"]); cols["websites"].append(None); cols["emails"].append(None); cols["operating_status"].append("open")
        cols["sources"].append([{"property": "", "dataset": "meta", "license": "CDLA-Permissive-2.0", "record_id": "UPSTREAM-SECRET", "update_time": "2026-01-01"}])
    return pa.table(cols, schema=schema)


ROWS = [
    {"id": "11111111-aaaa-4aaa-8aaa-000000000001", "name": "Garage Tremblay & Fils", "pt": (-73.5673, 45.5017), "street": "1200 Rue Saint-Denis", "city": "Montréal", "postcode": "H2X 3K4", "region": "QC"},
    {"id": "11111111-aaaa-4aaa-8aaa-000000000002", "name": "Speedy Auto Service", "pt": (-79.3832, 43.6532), "street": "88 Queen St W", "city": "Toronto", "postcode": "M5H 2M9", "region": "ON"},
    {"id": "11111111-aaaa-4aaa-8aaa-000000000003", "name": "Pacific Brake & Muffler", "pt": (-123.1207, 49.2827), "street": "1450 W Broadway", "city": "Vancouver", "postcode": "V6H 1H6", "region": "BC"},
    {"id": "11111111-aaaa-4aaa-8aaa-000000000004", "name": "Northern Lights Auto", "pt": (-135.0568, 60.7212), "street": "4 Main St", "city": "Whitehorse", "postcode": "Y1A 2B5", "region": "YT"},
    {"id": "11111111-aaaa-4aaa-8aaa-000000000005", "name": "Atlantic Tire & Auto", "pt": (-63.5752, 44.6488), "street": "2000 Barrington St", "city": "Halifax", "postcode": "B3J 3K1", "region": "NS"},
    {"id": "11111111-aaaa-4aaa-8aaa-000000000006", "name": "Detroit Motors", "pt": (-83.0458, 42.3314), "street": "1 Woodward", "city": "Detroit", "postcode": "48226", "region": "MI", "country": "US"},  # inside the generous Ontario box, but not Canadian
]
PLAN_ALL = {"taxonomyPrimaries": ["automotive_repair"], "hierarchyAny": ["vehicle_service"], "minConfidence": 0.0,
            "bboxes": [[-79.8, 44.9, -57.1, 62.6], [-95.2, 41.6, -74.3, 56.9], [-139.1, 48.2, -114.0, 60.0], [-141.1, 59.9, -123.8, 69.7], [-66.5, 43.3, -59.6, 47.1]]}


@unittest.skipIf(pa is None, "pyarrow not installed")
class RealisticOverture(unittest.TestCase):
    def setUp(self):
        import tempfile
        self.dir = tempfile.mkdtemp()
        self.path = os.path.join(self.dir, "part.parquet")
        pq.write_table(overture_table(ROWS), self.path, row_group_size=2)

    def test_float32_bbox_is_really_widened_and_still_yields_points(self):
        pf = pq.ParquetFile(self.path)
        row = pf.read_row_groups([0], columns=ex.COLUMNS).to_pylist()[0]
        b = row["bbox"]
        self.assertNotEqual(b["xmin"], -73.5673, "float32 storage must differ from the python double (that is the whole point of this fixture)")
        self.assertIsNotNone(ex.source_point(row))
        self.assertAlmostEqual(ex.source_point(row)["lng"], -73.5673, places=4)

    def test_extract_shard_emits_points_for_every_province_and_counts_them(self):
        pf = pq.ParquetFile(self.path)
        hits = ex.row_group_hits(pf.metadata, {pf.metadata.schema.column(i).path: i for i in range(pf.metadata.num_columns)}, PLAN_ALL["bboxes"])
        tmp = os.path.join(self.dir, "shard.ndjson")
        c = ex.extract_shard(pf, hits, PLAN_ALL["bboxes"], PLAN_ALL, 2, tmp)
        self.assertEqual(c["emitted"], 5)           # the Detroit row sits inside the (generous) Ontario box but is a US address
        self.assertEqual(c["withPoint"], 5)         # no coordinate may be lost
        import json
        recs = [json.loads(l) for l in open(tmp, encoding="utf-8")]
        self.assertEqual({r["address"]["region"] for r in recs}, {"QC", "ON", "BC", "YT", "NS"})
        self.assertTrue(all(r["geo"] and 40 < r["geo"]["lat"] < 70 and -142 < r["geo"]["lng"] < -55 for r in recs))
        self.assertNotIn("UPSTREAM-SECRET", open(tmp, encoding="utf-8").read())

    def test_zero_result_plan_is_distinguishable_from_unreadable_input(self):
        pf = pq.ParquetFile(self.path)
        plan = {**PLAN_ALL, "taxonomyPrimaries": ["nothing_matches"], "hierarchyAny": ["nothing_matches"]}
        tmp = os.path.join(self.dir, "empty.ndjson")
        hits = list(range(pf.metadata.num_row_groups))
        c = ex.extract_shard(pf, hits, PLAN_ALL["bboxes"], plan, 2, tmp)
        self.assertEqual((c["emitted"], c["withPoint"]), (0, 0))
        self.assertGreater(c["examined"], 0, "rows were read: this is a legitimate zero-result run, which GarageOS distinguishes from a read failure")

    def test_contract_fixture_matches_what_the_extractor_emits(self):
        """tests/fixtures/lead-radar/overture-records.ndjson is the TypeScript side's input (tests/lead-radar-national-contract.test.ts). It must be exactly what this
        extractor emits for the realistic Parquet above, so the two languages cannot drift. Regenerate with UPDATE_FIXTURE=1."""
        pf = pq.ParquetFile(self.path)
        hits = list(range(pf.metadata.num_row_groups))
        tmp = os.path.join(self.dir, "contract.ndjson")
        ex.extract_shard(pf, hits, PLAN_ALL["bboxes"], PLAN_ALL, 2, tmp)
        got = sorted(open(tmp, encoding="utf-8").read().splitlines())
        fixture = os.path.join(os.path.dirname(__file__), "..", "..", "tests", "fixtures", "lead-radar", "overture-records.ndjson")
        if os.environ.get("UPDATE_FIXTURE") == "1":
            os.makedirs(os.path.dirname(fixture), exist_ok=True)
            open(fixture, "w", encoding="utf-8", newline="\n").write("\n".join(got) + "\n")
        self.assertEqual(got, sorted(open(fixture, encoding="utf-8").read().splitlines()))


if __name__ == "__main__":
    unittest.main()
