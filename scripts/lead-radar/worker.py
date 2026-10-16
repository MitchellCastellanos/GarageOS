#!/usr/bin/env python3
"""GarageOS Lead Radar discovery worker (GitHub Actions / any scheduler). Replaces the founder's PC for routine extraction.

  LEAD_RADAR_WORKER_SECRET=… python3 scripts/lead-radar/worker.py --base-url https://www.garage-os.ca --work-dir ./work

Protocol (POST {base}/api/lead-radar/worker, bearer secret): peek → claim → [extract with overture_extract.py] → attach manifest → upload chunks → complete.
It only executes runs a Super Admin queued or scheduled, holds a lease (heartbeats while extracting), resumes from the last server-confirmed chunk after any
interruption, and reports failures by code (never record data). Standard library only; the extractor has its own requirements (pyarrow, fsspec…).

Exit codes: 0 = nothing to do / run completed / lease lost to another worker; 1 = this attempt failed (reported; GarageOS retries with backoff);
2 = the run finished but the quality gate stopped it (needs a person: see the run page).
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
CHUNK_LINES = 250
CHUNK_BYTES = 1_200_000
HEARTBEAT_SECONDS = 120
HTTP_ATTEMPTS = 4


def log(msg: str) -> None:
    print(f"[lead-radar-worker] {msg}", file=sys.stderr, flush=True)


class ApiError(Exception):
    def __init__(self, status: int, code: str):
        super().__init__(f"{status} {code}")
        self.status, self.code = status, code


class Api:
    def __init__(self, base_url: str, secret: str, opener=urllib.request.urlopen):
        if not base_url.startswith("https://") and not base_url.startswith("http://localhost") and not base_url.startswith("http://127.0.0.1"):
            raise SystemExit("--base-url must be an https origin")
        if len(secret) < 16:
            raise SystemExit("LEAD_RADAR_WORKER_SECRET is missing or too short")
        self.url = base_url.rstrip("/") + "/api/lead-radar/worker"
        self.secret, self.opener = secret, opener

    def call(self, payload: dict) -> dict:
        data = json.dumps(payload).encode("utf-8")
        last: Exception | None = None
        for attempt in range(1, HTTP_ATTEMPTS + 1):
            req = urllib.request.Request(self.url, data=data, method="POST", headers={"content-type": "application/json", "authorization": f"Bearer {self.secret}"})
            try:
                with self.opener(req, timeout=90) as r:
                    return json.loads(r.read().decode("utf-8") or "{}")
            except urllib.error.HTTPError as e:
                try:
                    code = json.loads(e.read().decode("utf-8")).get("error", "HTTP_ERROR")
                except Exception:  # noqa: BLE001
                    code = "HTTP_ERROR"
                if e.code < 500:
                    raise ApiError(e.code, code) from None  # protocol answers (lease lost, out of order, …) are not retried here
                last = ApiError(e.code, code)
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                last = e
            if attempt < HTTP_ATTEMPTS:
                time.sleep(min(2 ** attempt, 20))
        raise ApiError(0, "NETWORK") from last


def chunks(path: str):
    """Deterministic chunking (same file ⇒ same chunk numbers on every attempt), which is what makes resume-by-sequence-number safe."""
    buf: list[str] = []
    size = 0
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.rstrip("\n")
            if not line:
                continue
            if buf and (len(buf) >= CHUNK_LINES or size + len(line) > CHUNK_BYTES):
                yield "\n".join(buf)
                buf, size = [], 0
            buf.append(line)
            size += len(line) + 1
    if buf:
        yield "\n".join(buf)


class Heartbeat(threading.Thread):
    def __init__(self, api: Api, run_id: str, worker_id: str, every: float = HEARTBEAT_SECONDS):
        super().__init__(daemon=True)
        self.api, self.run_id, self.worker_id, self.every, self.stop_evt, self.lost = api, run_id, worker_id, every, threading.Event(), False

    def run(self) -> None:
        while not self.stop_evt.wait(self.every):
            try:
                self.api.call({"action": "heartbeat", "runId": self.run_id, "workerId": self.worker_id})
            except ApiError as e:
                if e.code == "LEASE_LOST":
                    self.lost = True
                    return
                log(f"heartbeat failed ({e}); will retry")


def run_extractor(plan_path: str, out_dir: str, extractor_cmd: list[str]) -> None:
    cmd = [*extractor_cmd, "--plan", plan_path, "--out", out_dir]
    log("extractor: " + " ".join(cmd))
    # The extractor only reads the public Overture bucket: it never needs (and never receives) the GarageOS bearer secret.
    env = {k: v for k, v in os.environ.items() if k not in ("LEAD_RADAR_WORKER_SECRET", "CRON_SECRET", "SALES_CRON_SECRET")}
    r = subprocess.run(cmd, env=env)
    if r.returncode != 0:
        raise RuntimeError(f"EXTRACTOR_EXIT_{r.returncode}")


def work_one(api: Api, work_dir: str, extractor_cmd: list[str], worker_id: str, heartbeat_every: float = HEARTBEAT_SECONDS) -> int:
    peek = api.call({"action": "peek"})
    if not peek.get("pending"):
        log(f"nothing to do ({peek.get('reason')})")
        return 0
    claim = api.call({"action": "claim", "workerId": worker_id}).get("run")
    if not claim:
        log("nothing claimable")
        return 0
    run_id, plan = claim["runId"], claim["plan"]
    log(f"claimed run {run_id} (attempt {claim['attempt']}, provinces {','.join(plan['provinces'])}, release {plan['release']}, resume after chunk {claim['lastChunkSeq']})")
    base = os.path.join(work_dir, plan["planHash"][:12])
    out_dir = os.path.join(base, "out")
    os.makedirs(out_dir, exist_ok=True)
    plan_path = os.path.join(base, "plan.json")
    with open(plan_path, "w", encoding="utf-8") as fh:
        json.dump(plan, fh)
    hb = Heartbeat(api, run_id, worker_id, heartbeat_every)
    hb.start()
    try:
        run_extractor(plan_path, out_dir, extractor_cmd)   # resumable: finished shards in out_dir/parts are skipped (cache the work dir between attempts)
        if hb.lost:
            log("lease lost during extraction; another worker owns the run")
            return 0
        with open(os.path.join(out_dir, "manifest.json"), encoding="utf-8") as fh:
            manifest = json.load(fh)
        records = os.path.join(out_dir, "records.ndjson")
        att = api.call({"action": "attach", "runId": run_id, "workerId": worker_id, "manifest": manifest})
        last = int(att.get("lastChunkSeq", -1))
        sent = skipped = 0
        for seq, text in enumerate(chunks(records)):
            if seq <= last:
                skipped += 1
                continue
            try:
                api.call({"action": "chunk", "runId": run_id, "workerId": worker_id, "seq": seq, "ndjson": text})
            except ApiError as e:
                if e.code != "CHUNK_OUT_OF_ORDER":
                    raise
                last = int(api.call({"action": "attach", "runId": run_id, "workerId": worker_id, "manifest": manifest}).get("lastChunkSeq", -1))
                if seq <= last:
                    skipped += 1
                    continue
                raise
            sent += 1
        log(f"uploaded {sent} chunks ({skipped} already confirmed)")
        done = api.call({"action": "complete", "runId": run_id, "workerId": worker_id})
        if done.get("blocking"):
            log(f"::error::run {run_id} was stopped by the quality gate: {done.get('verdict')}. Open the run page in GarageOS.")
            return 2
        log(f"run {run_id} completed (verdict {done.get('verdict')})")
        return 0
    except ApiError as e:
        if e.code in ("LEASE_LOST", "RUN_CANCELLED"):
            log(f"stopping: {e.code}")
            return 0
        report(api, run_id, worker_id, e.code or "API_ERROR")
        return 1
    except Exception as e:  # noqa: BLE001 - any failure is reported by code, the run is retried by GarageOS with backoff
        code = str(e) if str(e).startswith("EXTRACTOR_EXIT_") else type(e).__name__.upper()
        report(api, run_id, worker_id, code)
        return 1
    finally:
        hb.stop_evt.set()


def report(api: Api, run_id: str, worker_id: str, code: str) -> None:
    log(f"attempt failed: {code}")
    try:
        r = api.call({"action": "fail", "runId": run_id, "workerId": worker_id, "code": code})
        log(f"reported; attempts={r.get('attempts')} exhausted={r.get('exhausted')}")
    except ApiError as e:
        log(f"could not report the failure ({e}); the lease will expire and GarageOS will retry")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base-url", required=True)
    ap.add_argument("--work-dir", default="./lead-radar-work")
    ap.add_argument("--worker-id", default=os.environ.get("LEAD_RADAR_WORKER_ID") or f"gh-{uuid.uuid4().hex[:12]}")
    ap.add_argument("--extractor", default=os.path.join(HERE, "overture_extract.py"))
    a = ap.parse_args()
    api = Api(a.base_url, os.environ.get("LEAD_RADAR_WORKER_SECRET", ""))
    return work_one(api, a.work_dir, [sys.executable, a.extractor], a.worker_id)


if __name__ == "__main__":
    sys.exit(main())
