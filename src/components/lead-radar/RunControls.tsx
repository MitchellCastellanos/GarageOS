"use client";

import { useRef, useState } from "react";
import { attachDiscoveryManifest, cancelDiscoveryRun, completeDiscoveryRun, getDiscoveryPlan, ingestDiscoveryChunk, resumeDiscoveryRun } from "@/actions/lead-radar";
import { Sha256 } from "@/lib/lead-radar/sha256";
import { btnDanger, btnPrimary, btnSecondary, cardCls } from "@/components/sales-crm/ui";
import { FormMessage } from "@/components/sales-crm/useCrmAction";
import { useRadarAction } from "@/components/lead-radar/useRadarAction";

const CHUNK_LINES = 250;
const MAX_ATTEMPTS = 3;

async function* lines(file: File, onBytes: (b: Uint8Array) => void): AsyncGenerator<string> {
  const reader = file.stream().getReader(), dec = new TextDecoder();
  let rest = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) { onBytes(value); rest += dec.decode(value, { stream: true }); }
    const parts = rest.split("\n");
    rest = done ? "" : parts.pop() ?? "";
    for (const p of done ? parts : parts) if (p.trim()) yield p;
    if (done) { if (rest.trim()) yield rest; return; }
  }
}

export function RunControls({ locale, run: r }: { locale: "en" | "fr"; run: { id: string; status: string; lastChunkSeq: number; expected: number | null; received: number; hasManifest: boolean } }) {
  const { c, pending, error, notice, run, setError, setNotice } = useRadarAction(locale);
  const k = c.runs;
  const manifestRef = useRef<HTMLInputElement>(null), recordsRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const canUpload = r.status === "PLANNED" || r.status === "INGESTING";

  async function download() {
    const res = await getDiscoveryPlan(r.id);
    if (!res.ok) { setError(c.errors[res.error] ?? c.errors.unexpected); return; }
    const url = URL.createObjectURL(new Blob([JSON.stringify(res.plan, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "plan.json"; a.click(); URL.revokeObjectURL(url);
  }

  async function upload() {
    const mf = manifestRef.current?.files?.[0], rf = recordsRef.current?.files?.[0];
    if (!mf || !rf) { setError(k.pickFiles); return; }
    setError(null); setNotice(null); setBusy(true);
    try {
      const manifestText = await mf.text();
      const manifest = JSON.parse(manifestText) as { recordCount: number; fileSha256: string };
      // Pass 1: verify the whole file against the manifest BEFORE sending anything.
      const sha = new Sha256(); let count = 0;
      for await (const _l of lines(rf, (b) => sha.update(b))) { void _l; count++; }
      if (sha.hex() !== manifest.fileSha256) { setError(k.hashMismatch); return; }
      if (count !== manifest.recordCount) { setError(k.countMismatch); return; }
      const att = await attachDiscoveryManifest(r.id, manifestText);
      if (!att.ok) { setError(c.errors[att.error] ?? c.errors.unexpected); return; }
      // Pass 2: upload chunks, skipping the ones the server already confirmed (restartable).
      const resumeFrom = att.lastChunkSeq + 1, total = Math.ceil(count / CHUNK_LINES);
      let seq = 0, buf: string[] = [];
      const send = async () => {
        if (seq >= resumeFrom) {
          for (let attempt = 1; ; attempt++) {
            let res;
            try { res = await ingestDiscoveryChunk(r.id, seq, buf.join("\n")); } catch { res = { ok: false as const, error: "CHUNK_FAILED" }; }
            if (res.ok) break;
            if (res.error !== "CHUNK_FAILED" || attempt >= MAX_ATTEMPTS) throw new Error(res.error);
          }
        }
        seq++; buf = []; setProgress({ done: seq, total });
      };
      setProgress({ done: resumeFrom, total });
      for await (const l of lines(rf, () => undefined)) { buf.push(l); if (buf.length === CHUNK_LINES) await send(); }
      if (buf.length) await send();
      const done = await completeDiscoveryRun(r.id);
      if (!done.ok) { setError(c.errors[done.error] ?? c.errors.unexpected); return; }
      setNotice(k.uploaded);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      setError(c.errors[m] ?? c.errors.unexpected);
    } finally { setBusy(false); run(async () => ({ ok: true as const })); }
  }

  return (
    <section className={`${cardCls} space-y-3`} aria-labelledby="lr-run-ctl">
      <h2 id="lr-run-ctl" className="font-semibold text-slate-900">{k.upload}</h2>
      <p className="text-sm text-slate-600">{k.planHelp}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnSecondary} onClick={download} disabled={busy}>{k.downloadPlan}</button>
        {r.status === "CANCELLED" && <button type="button" className={btnSecondary} disabled={pending} onClick={() => run(() => resumeDiscoveryRun(r.id))}>{k.resume}</button>}
        {canUpload && <button type="button" className={btnDanger} disabled={pending || busy} onClick={() => { if (window.confirm(k.confirmCancel)) run(() => cancelDiscoveryRun(r.id)); }}>{k.cancel}</button>}
      </div>
      {canUpload && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium text-slate-700">{k.manifestFile}<input ref={manifestRef} type="file" accept="application/json,.json" disabled={busy} className="min-h-11 text-sm" /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">{k.recordsFile}<input ref={recordsRef} type="file" accept=".ndjson,.jsonl,.txt,application/x-ndjson" disabled={busy} className="min-h-11 text-sm" /></label>
        </div>
      )}
      {progress && (
        <div aria-live="polite" className="space-y-1">
          <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-blue-600" style={{ width: `${progress.total ? Math.min(100, (100 * progress.done) / progress.total) : 0}%` }} /></div>
          <p className="text-xs text-slate-600">{k.chunk} {progress.done} {k.of} {progress.total}</p>
        </div>
      )}
      <FormMessage error={error} notice={notice} />
      {canUpload && <button type="button" className={btnPrimary} onClick={upload} disabled={busy || pending}>{busy ? k.uploading : k.start}</button>}
    </section>
  );
}
