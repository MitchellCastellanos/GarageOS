"""Unit tests for the pure parts of overture_extract.py (no network). Run: python3 -m unittest scripts/lead-radar/test_extract.py"""
import importlib.util, os, unittest

spec = importlib.util.spec_from_file_location("ex", os.path.join(os.path.dirname(__file__), "overture_extract.py"))
ex = importlib.util.module_from_spec(spec); spec.loader.exec_module(ex)

PLAN = {"taxonomyPrimaries": ["automotive_repair"], "hierarchyAny": ["vehicle_service"], "minConfidence": 0.3, "bboxes": [[-74.05, 45.35, -73.4, 45.75]]}
ROW = {"id": "abc-12345678", "confidence": 0.9, "names": {"primary": "Garage X"}, "taxonomy": {"primary": "automotive_repair", "hierarchy": ["a", "vehicle_service"], "alternates": None},
       "addresses": [{"freeform": "1 Rue A", "locality": "Montréal", "postcode": "H2X1Y4", "region": "QC", "country": "CA"}], "phones": ["+15145550100"], "websites": None, "emails": None,
       "sources": [{"dataset": "meta", "license": "CDLA-Permissive-2.0", "record_id": "SECRET-UPSTREAM", "update_time": "x"}], "brand": None, "operating_status": None, "bbox": {"xmin": -73.6, "ymin": 45.5}}

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
if __name__ == "__main__":
    unittest.main()
