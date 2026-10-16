"""Worker protocol tests against an in-memory fake of /api/lead-radar/worker (no network, stub extractor). Run: python3 -m unittest scripts/lead-radar/test_worker.py"""
import importlib.util, io, json, os, sys, tempfile, unittest, urllib.error

spec = importlib.util.spec_from_file_location("w", os.path.join(os.path.dirname(__file__), "worker.py"))
w = importlib.util.module_from_spec(spec); spec.loader.exec_module(w)

PLAN = {"planVersion": 1, "planHash": "a" * 64, "release": "2026-11-18.0", "provinces": ["ON"], "bboxes": [[0, 0, 1, 1]], "taxonomyPrimaries": [], "hierarchyAny": [], "minConfidence": 0, "cityKeys": []}


class FakeServer:
    """Mimics the server's rules: lease ownership, chunk compare-and-set, out-of-order refusal, quality verdict."""
    def __init__(self, pending=True, verdict="OK", blocking=False, last_seq=-1, lease_lost_on=None):
        self.pending, self.verdict, self.blocking, self.last, self.lease_lost_on = pending, verdict, blocking, last_seq, lease_lost_on
        self.calls, self.chunks, self.failed = [], [], None

    def __call__(self, req, timeout=0):
        p = json.loads(req.data.decode()); a = p["action"]; self.calls.append(a)
        assert req.headers["Authorization"].startswith("Bearer ") and len(req.headers["Authorization"]) > 20
        def err(status, code): raise urllib.error.HTTPError(req.full_url, status, code, {}, io.BytesIO(json.dumps({"error": code}).encode()))
        if a == "peek": return Resp({"pending": self.pending, "reason": "QUEUED" if self.pending else "NOTHING_QUEUED"})
        if a == "claim": return Resp({"run": {"runId": "run1", "workerId": p["workerId"], "attempt": 1, "leaseMs": 600000, "plan": PLAN, "lastChunkSeq": self.last, "manifestAttached": self.last >= 0, "expectedRecords": None}})
        if a == "heartbeat": return Resp({"leaseMs": 600000})
        if a == "attach": return Resp({"runId": "run1", "lastChunkSeq": self.last, "alreadyAttached": self.last >= 0})
        if a == "chunk":
            if self.lease_lost_on == p["seq"]: err(409, "LEASE_LOST")
            if p["seq"] != self.last + 1: err(409, "CHUNK_OUT_OF_ORDER")
            self.last = p["seq"]; self.chunks.append(p["seq"]); return Resp({"duplicate": False})
        if a == "complete": return Resp({"alreadyCompleted": False, "verdict": self.verdict, "blocking": self.blocking})
        if a == "fail": self.failed = p["code"]; return Resp({"attempts": 1, "exhausted": False})
        raise AssertionError(a)


class Resp:
    def __init__(self, d): self.d = d
    def __enter__(self): return self
    def __exit__(self, *a): return False
    def read(self): return json.dumps(self.d).encode()


def stub_extractor(tmp, n_records=600, fail_code=None):
    path = os.path.join(tmp, "stub.py")
    open(path, "w").write(f'''
import argparse, json, os, sys
ap = argparse.ArgumentParser(); ap.add_argument("--plan"); ap.add_argument("--out"); a = ap.parse_args()
if {fail_code!r}: sys.exit({fail_code!r})
os.makedirs(a.out, exist_ok=True)
with open(os.path.join(a.out, "records.ndjson"), "w") as f:
    for i in range({n_records}): f.write(json.dumps({{"v": 1, "id": "id-%08d" % i}}) + "\\n")
json.dump({{"recordCount": {n_records}, "planHash": "a" * 64}}, open(os.path.join(a.out, "manifest.json"), "w"))
''')
    return [sys.executable, path]


def api(server): return w.Api("https://example.test", "s" * 32, opener=server)


class WorkerProtocol(unittest.TestCase):
    def run_one(self, server, **kw):
        with tempfile.TemporaryDirectory() as tmp:
            cmd = stub_extractor(tmp, **kw)
            return w.work_one(api(server), os.path.join(tmp, "work"), cmd, "gh-test", heartbeat_every=3600)

    def test_nothing_queued_exits_cleanly_without_claiming(self):
        s = FakeServer(pending=False)
        self.assertEqual(self.run_one(s), 0)
        self.assertEqual(s.calls, ["peek"])

    def test_full_run_uploads_deterministic_chunks_in_order_and_completes(self):
        s = FakeServer()
        self.assertEqual(self.run_one(s, n_records=600), 0)
        self.assertEqual(s.chunks, [0, 1, 2])
        self.assertEqual(s.calls[-1], "complete")

    def test_resume_skips_chunks_the_server_already_confirmed(self):
        s = FakeServer(last_seq=1)
        self.assertEqual(self.run_one(s, n_records=600), 0)
        self.assertEqual(s.chunks, [2], "only the missing chunk is sent after an interruption")

    def test_quality_gate_stop_is_exit_2_and_not_retried(self):
        s = FakeServer(verdict="NO_COORDINATES", blocking=True)
        self.assertEqual(self.run_one(s), 2)
        self.assertIsNone(s.failed)

    def test_extractor_failure_is_reported_by_code_for_retry(self):
        s = FakeServer()
        self.assertEqual(self.run_one(s, fail_code=7), 1)
        self.assertEqual(s.failed, "EXTRACTOR_EXIT_7")

    def test_lease_lost_mid_upload_stops_quietly_without_reporting_failure(self):
        s = FakeServer(lease_lost_on=1)
        self.assertEqual(self.run_one(s), 0)
        self.assertIsNone(s.failed)

    def test_chunking_is_deterministic_and_bounded(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = os.path.join(tmp, "r.ndjson")
            open(p, "w").write("".join(json.dumps({"i": i, "pad": "x" * 5000}) + "\n" for i in range(1000)))
            a, b = list(w.chunks(p)), list(w.chunks(p))
            self.assertEqual(a, b)
            self.assertTrue(all(len(c.split("\n")) <= w.CHUNK_LINES and len(c) <= w.CHUNK_BYTES + 6000 for c in a))
            self.assertEqual(sum(len(c.split("\n")) for c in a), 1000)

    def test_refuses_insecure_origin_and_missing_secret(self):
        with self.assertRaises(SystemExit): w.Api("http://evil.example", "s" * 32)
        with self.assertRaises(SystemExit): w.Api("https://ok.example", "short")


if __name__ == "__main__":
    unittest.main()
