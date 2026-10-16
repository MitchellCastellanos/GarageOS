"use client";

import { useState } from "react";
import { compareLeadPolicies } from "@/actions/lead-radar-automation";
import { btnPrimary, btnSecondary, cardCls, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage } from "@/components/sales-crm/useCrmAction";
import { useRadarAction } from "@/components/lead-radar/useRadarAction";
import type { ComparisonReport } from "@/domain/lead-radar/policy-compare";

type Pol = { id: string; version: number; name: string; status: string };
const n = (x: number) => x.toLocaleString("en-CA");

export function PolicyComparePanel({ locale, policies }: { locale: "en" | "fr"; policies: Pol[] }) {
  const { c, pending, error, run } = useRadarAction(locale);
  const k = c.automation.compare;
  const opts = [{ v: "preset:V1", l: k.v1 }, { v: "preset:V2", l: k.v2 }, ...policies.map((p) => ({ v: `policy:${p.id}`, l: `v${p.version} · ${p.name}` }))];
  const [a, setA] = useState("preset:V1");
  const [b, setB] = useState("preset:V2");
  const [names, setNames] = useState(false);
  const [res, setRes] = useState<{ report: ComparisonReport; truncated: boolean; markdown: string } | null>(null);
  const side = (v: string) => (v.startsWith("policy:") ? { policyId: v.slice(7) } : { preset: v.slice(7) as "V1" | "V2" });
  const r = res?.report;
  const lanes = ["AUTO_ELIGIBLE", "HUMAN_REVIEW", "BLOCKED"] as const;
  const download = () => { if (!res) return; const url = URL.createObjectURL(new Blob([res.markdown], { type: "text/markdown" })); const el = document.createElement("a"); el.href = url; el.download = "lead-radar-policy-comparison.md"; el.click(); URL.revokeObjectURL(url); };

  return (
    <section className={`${cardCls} space-y-4`} aria-labelledby="au-cmp">
      <h2 id="au-cmp" className="font-semibold text-slate-900">{k.title}</h2>
      <p className="text-sm text-slate-600">{k.help}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelCls}>{k.sideA}<select className={inputCls} value={a} onChange={(e) => setA(e.target.value)} disabled={pending}>{opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select></label>
        <label className={labelCls}>{k.sideB}<select className={inputCls} value={b} onChange={(e) => setB(e.target.value)} disabled={pending}>{opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select></label>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="size-5" checked={names} onChange={(e) => setNames(e.target.checked)} />{k.names}</label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnPrimary} disabled={pending} onClick={() => run(() => compareLeadPolicies({ a: side(a), b: side(b), includeNames: names }), (x) => setRes({ report: x.report as ComparisonReport, truncated: x.truncated, markdown: x.markdown }))}>{pending ? k.running : k.run}</button>
        {res && <button type="button" className={btnSecondary} onClick={download}>{k.download}</button>}
      </div>
      <FormMessage error={error} notice={null} />
      {r && (
        <div className="space-y-4 text-sm">
          <p className="text-xs text-slate-500">{k.readOnly} {k.evaluated}: <strong>{n(r.evaluated)}</strong>{res!.truncated ? ` · ${c.automation.policy.truncated}` : ""}</p>
          <p role="status" className={`rounded px-3 py-2 ${r.invariants.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>{r.invariants.ok ? k.invariantsOk : `${k.invariantsBad}: ${r.invariants.violations.map((v) => `${v.rule} (${v.count})`).join("; ")}`}</p>
          <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-left"><thead className="text-xs text-slate-500"><tr><th className="py-1 pr-3">{k.lane}</th><th className="pr-3 text-right">A</th><th className="pr-3 text-right">B</th><th className="text-right">Δ</th></tr></thead>
            <tbody>{lanes.map((l) => <tr key={l} className="border-t border-slate-100"><td className="py-1 pr-3">{c.automation.policy.lanes[l]}</td><td className="pr-3 text-right tabular-nums">{n(r.a.lanes[l])}</td><td className="pr-3 text-right tabular-nums">{n(r.b.lanes[l])}</td><td className="text-right tabular-nums">{r.b.lanes[l] - r.a.lanes[l] >= 0 ? "+" : ""}{n(r.b.lanes[l] - r.a.lanes[l])}</td></tr>)}</tbody></table></div>
          <div><h3 className="font-medium text-slate-800">{k.movements}</h3>
            <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead className="text-slate-500"><tr><th className="py-1 pr-3">{k.move}</th><th className="pr-3">{k.cause}</th><th className="text-right">{k.count}</th></tr></thead>
              <tbody>{r.movements.map((g, i) => <tr key={i} className="border-t border-slate-100 align-top"><td className="py-1 pr-3 whitespace-nowrap">{c.automation.policy.lanes[g.from]} → {c.automation.policy.lanes[g.to]}</td><td className="pr-3">{g.cause.split(" ⇒ ").map((side, j) => <span key={j} className="block">{j === 0 ? "− " : "+ "}{side === "—" ? "—" : side.split(" + ").map((x) => c.automation.qualification.reasons[x] ?? x).join(" · ")}</span>)}<span className="text-slate-500">{Object.entries(g.byBusinessType).map(([t, v]) => `${c.automation.types[t] ?? t} ${v}`).join(" · ")}</span>
                {g.examples.length > 0 && <span className="mt-1 block text-slate-500">{g.examples.map((e) => [e.name, e.city, e.category].filter(Boolean).join(" · ")).join(" | ")}</span>}</td><td className="text-right tabular-nums">{n(g.count)}</td></tr>)}</tbody></table></div></div>
          <div><h3 className="font-medium text-slate-800">{k.byType}</h3>
            <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs"><thead className="text-slate-500"><tr><th className="py-1 pr-3">{k.type}</th><th className="pr-3 text-right">{k.total}</th><th className="pr-3 text-right">A auto</th><th className="pr-3 text-right">B auto</th><th className="pr-3 text-right">B review</th><th className="text-right">B blocked</th></tr></thead>
              <tbody>{Object.entries(r.byBusinessType).sort((x, y) => y[1].total - x[1].total).map(([t, v]) => <tr key={t} className="border-t border-slate-100"><td className="py-1 pr-3">{c.automation.types[t] ?? t}</td><td className="pr-3 text-right tabular-nums">{n(v.total)}</td><td className="pr-3 text-right tabular-nums">{n(v.a.AUTO_ELIGIBLE)}</td><td className="pr-3 text-right tabular-nums">{n(v.b.AUTO_ELIGIBLE)}</td><td className="pr-3 text-right tabular-nums">{n(v.b.HUMAN_REVIEW)}</td><td className="text-right tabular-nums">{n(v.b.BLOCKED)}</td></tr>)}</tbody></table></div></div>
          <div className="rounded-lg bg-slate-50 p-3"><h3 className="font-medium text-slate-800">{k.pilot}</h3>
            <p>{k.pilotLine.replace("{a}", n(r.pilot.autoA)).replace("{b}", n(r.pilot.autoB)).replace("{ra}", n(r.pilot.reviewA)).replace("{rb}", n(r.pilot.reviewB)).replace("{pct}", String(r.pilot.reviewReductionPct)).replace("{field}", n(r.pilot.autoBMontrealField)).replace("{remote}", n(r.pilot.autoBRemote))}</p>
            <p className="mt-1 text-xs text-slate-500">{k.lowConfLine.replace("{f}", n(r.lowConfidence.flagged)).replace("{p}", n(r.lowConfidence.withPhoneAndStreetAddress)).replace("{c}", n(r.lowConfidence.corroboratedAndAutoUnderB))}</p></div>
        </div>
      )}
    </section>
  );
}
