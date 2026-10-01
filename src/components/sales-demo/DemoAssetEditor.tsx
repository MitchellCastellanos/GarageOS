"use client";
/* eslint-disable @next/next/no-img-element -- local previews and public brand assets */
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { uploadSalesDemoAsset } from "@/actions/sales-demo";
import { CHATGPT_LOGO_PROMPT, salesDemoCopy } from "@/lib/admin-locale/sales-demo";
import type { AdminLocale } from "@/lib/admin-locale";
import type { DemoAssetKind } from "@/lib/sales-demo-assets";
import { MAX_LOGO_BYTES } from "@/lib/logo-upload";

const button = "inline-flex min-h-11 items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium focus-within:ring-2 focus-visible:ring-2 disabled:opacity-50";

export function DemoAssetEditor({ demoId, kind, initialUrl, locale }: {
  demoId: string; kind: DemoAssetKind; initialUrl: string | null; locale: AdminLocale;
}) {
  const t = salesDemoCopy(locale);
  const id = useId();
  const [file, setRawFile] = useState<File | null>(null);
  const [prepared, setRawPrepared] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [savedUrl, setSavedUrl] = useState(initialUrl);
  const [crop, setCrop] = useState({ left: 0, top: 0, width: 100, height: 100 });
  const [rotation, setRotation] = useState(0);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const sourceRef = useRef<string | null>(null);
  const previewRef = useRef<string | null>(null);
  function setFile(next: File | null) {
    if (sourceRef.current) URL.revokeObjectURL(sourceRef.current);
    sourceRef.current = next ? URL.createObjectURL(next) : null;
    setRawFile(next); setSourceUrl(sourceRef.current);
  }
  function setPrepared(next: File | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = next ? URL.createObjectURL(next) : null;
    setRawPrepared(next); setPreviewUrl(previewRef.current);
  }
  useEffect(() => {
    return () => {
      if (sourceRef.current) URL.revokeObjectURL(sourceRef.current);
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);
  function choose(selected?: File) {
    setMessage(""); setCopied(false); setPrepared(null);
    setCrop({ left: 0, top: 0, width: 100, height: 100 }); setRotation(0);
    if (!selected) return;
    if (selected.size > MAX_LOGO_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(selected.type)) {
      setMessage(t.assetsHint); return;
    }
    setFile(selected);
  }
  function save(image: File) {
    startTransition(async () => {
      try {
        const form = new FormData(); form.set("kind", kind); form.set("image", image);
        const result = await uploadSalesDemoAsset(demoId, form);
        if (result.url) { setSavedUrl(result.url); setFile(null); setPrepared(null); setMessage(t.saved); }
        else setMessage(result.error === "notConfigured" ? t.storageError : t.error);
      } catch { setMessage(t.error); }
    });
  }
  function prepare() {
    if (!file) return;
    startTransition(async () => {
      try {
        const bitmap = await createImageBitmap(file);
        try {
          const x = Math.round(bitmap.width * crop.left / 100), y = Math.round(bitmap.height * crop.top / 100);
          const w = Math.max(1, Math.min(bitmap.width - x, Math.round(bitmap.width * crop.width / 100)));
          const h = Math.max(1, Math.min(bitmap.height - y, Math.round(bitmap.height * crop.height / 100)));
          const scale = Math.min(1, 2000 / Math.max(w, h));
          const canvas = document.createElement("canvas");
          const swap = rotation % 180 !== 0;
          canvas.width = Math.max(1, Math.round((swap ? h : w) * scale));
          canvas.height = Math.max(1, Math.round((swap ? w : h) * scale));
          const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("CANVAS");
          ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(rotation * Math.PI / 180);
          ctx.drawImage(bitmap, x, y, w, h, -w * scale / 2, -h * scale / 2, w * scale, h * scale);
          const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error("CANVAS")), "image/png"));
          if (blob.size > MAX_LOGO_BYTES) throw new Error("TOO_LARGE");
          setPrepared(new File([blob], "prepared-logo.png", { type: "image/png" }));
          setMessage("");
        } finally { bitmap.close(); }
      } catch { setMessage(t.error); }
    });
  }
  return <section className="min-w-0 space-y-4 rounded-xl border bg-white p-4 sm:p-5" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} className="text-lg font-semibold">{t[kind]} <span className="text-sm font-normal text-slate-500">· {t.optional}</span></h2>
    <div className="flex flex-wrap gap-2">
      {[true, false].map((camera) => <label key={String(camera)} className={`${button} cursor-pointer ${pending ? "pointer-events-none opacity-50" : ""}`}>
        {camera ? t.camera : t.device}
        <input aria-label={`${t[kind]} — ${camera ? t.camera : t.device}`} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp"
          capture={camera ? "environment" : undefined} disabled={pending} onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
      </label>)}
      <button type="button" className={button} disabled={pending} onClick={() => { setFile(null); setPrepared(null); setMessage(""); }}>{t.skip}</button>
    </div>
    {sourceUrl ? <>
      <div className="relative mx-auto max-w-md">
        <img src={sourceUrl} alt={t[kind]} className="w-full rounded-lg" />
        {kind === "logo" && <div className="pointer-events-none absolute border-2 border-blue-600 bg-blue-500/10" style={{ left: `${crop.left}%`, top: `${crop.top}%`, width: `${crop.width}%`, height: `${crop.height}%` }} />}
      </div>
      {kind === "logo" && <fieldset className="space-y-3"><legend className="font-medium">{t.crop}</legend>
        <div className="grid grid-cols-2 gap-3">
          {(["left", "top", "width", "height"] as const).map((key) => <label className="min-w-0 text-sm" key={key}>{t[key]}: {crop[key]}
            <input aria-label={t[key]} className="block min-h-11 w-full" type="range" value={crop[key]} min={key === "width" || key === "height" ? 1 : 0}
              max={key === "left" ? 99 : key === "top" ? 99 : key === "width" ? 100 - crop.left : 100 - crop.top} disabled={pending}
              onChange={(e) => { setPrepared(null); const value = Number(e.target.value); setCrop((c) => ({ ...c, [key]: value,
                ...(key === "left" ? { width: Math.min(c.width, 100 - value) } : {}), ...(key === "top" ? { height: Math.min(c.height, 100 - value) } : {}) })); }} />
          </label>)}
        </div>
        <label className="grid gap-2 text-sm">{t.rotate}
          <select className="min-h-11 rounded-lg border px-3" value={rotation} disabled={pending} onChange={(e) => { setRotation(Number(e.target.value)); setPrepared(null); }}>
            {[0, 90, 180, 270].map((r) => <option key={r} value={r}>{r}°</option>)}
          </select>
        </label>
        <button type="button" className={button} disabled={pending} onClick={prepare}>{t.apply}</button>
      </fieldset>}
      {previewUrl && <img src={previewUrl} alt={t.upload} className="mx-auto max-h-64 max-w-full rounded-lg border bg-slate-100 object-contain" />}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={pending} onClick={() => file && save(file)}>{t.original}</button>
        {prepared && <button type="button" className={`${button} bg-blue-600 text-white`} disabled={pending} onClick={() => save(prepared)}>{t.upload}</button>}
      </div>
    </> : savedUrl && <img src={savedUrl} alt={t[kind]} className="mx-auto max-h-64 max-w-full rounded-lg object-contain" />}
    {kind === "logo" && <details className="rounded-lg bg-slate-50 p-3">
      <summary className="min-h-11 cursor-pointer py-2 font-medium">{t.helper}</summary>
      <p className="mb-3 text-sm text-slate-600">{t.instructions}</p>
      <button type="button" className={button} onClick={async () => {
        try { await navigator.clipboard.writeText(CHATGPT_LOGO_PROMPT); setCopied(true); } catch { setMessage(t.error); }
      }}>{copied ? t.copied : t.copy}</button>
      <p role="status" className="text-sm">{copied ? t.copied : ""}</p>
    </details>}
    <p role="status" aria-live="polite" className="break-words text-sm text-slate-600">{pending ? t.saving : message}</p>
  </section>;
}
