import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { CrmError } from "@/lib/sales-crm/prospects";
import { claimRun, peekWork, workerAttach, workerComplete, workerFail, workerHeartbeat, workerIngest } from "@/lib/lead-radar/worker";

// Discovery worker protocol (called by the scheduled GitHub Actions job; see docs/lead-radar/national-engine.md). Authenticated with the same bearer secret as the cron
// endpoints (fails closed). It can only act on runs a Super Admin queued or scheduled, under a lease, and only while live discovery is ON. Responses carry counters and
// codes — never business data. Chunk bodies are bounded by the staging limits (≤ 300 records / 1.5 MB).
export const maxDuration = 60;

const id = z.string().min(1).max(60);
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("peek") }),
  z.object({ action: z.literal("claim"), workerId: id }),
  z.object({ action: z.literal("heartbeat"), runId: id, workerId: id }),
  z.object({ action: z.literal("attach"), runId: id, workerId: id, manifest: z.unknown() }),
  z.object({ action: z.literal("chunk"), runId: id, workerId: id, seq: z.number().int().min(0).max(100_000), ndjson: z.string().max(1_600_000) }),
  z.object({ action: z.literal("complete"), runId: id, workerId: id }),
  z.object({ action: z.literal("fail"), runId: id, workerId: id, code: z.string().max(60) }),
]);

export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let parsed;
  try { parsed = body.safeParse(await request.json()); } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }); }
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  const b = parsed.data;
  try {
    switch (b.action) {
      case "peek": return NextResponse.json(await peekWork());
      case "claim": return NextResponse.json({ run: await claimRun(b.workerId) });
      case "heartbeat": return NextResponse.json(await workerHeartbeat(b.runId, b.workerId));
      case "attach": return NextResponse.json(await workerAttach(b.runId, b.workerId, b.manifest));
      case "chunk": return NextResponse.json(await workerIngest(b.runId, b.workerId, b.seq, b.ndjson));
      case "complete": return NextResponse.json(await workerComplete(b.runId, b.workerId));
      case "fail": return NextResponse.json(await workerFail(b.runId, b.workerId, b.code));
    }
  } catch (e) {
    if (e instanceof CrmError) {
      // LEASE_LOST / RUN_CANCELLED / CHUNK_OUT_OF_ORDER … are protocol answers the worker acts on (stop or resume), not server faults.
      const status = e.code === "NOT_FOUND" ? 404 : e.code === "CHUNK_FAILED" ? 503 : 409;
      return NextResponse.json({ error: e.code }, { status });
    }
    console.error("[lead-radar] worker endpoint failed", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "WORKER_ENDPOINT_FAILED" }, { status: 500 });
  }
}
