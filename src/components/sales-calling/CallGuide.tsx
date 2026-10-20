"use client";

import { useState } from "react";
import { callingCopy, type CallingCopy } from "@/lib/admin-locale/sales-calling";
import { Badge } from "@/components/sales-crm/ui";
import { CopyIcon } from "./icons";
import { fill, type Locale } from "./shared";

export const GUIDE_STAGES = ["opening", "discovery", "value", "objections", "closing"] as const;
export type GuideStage = (typeof GUIDE_STAGES)[number];

/** Discovery objection codes the seller recorded → the matching guide reply to highlight. No AI: a fixed mapping of seller-entered data. */
const OBJECTION_TO_ITEM: Record<string, string> = { HAPPY_WITH_CURRENT: "haveSoftware", NO_TIME: "busy", SEASONAL_BUSY: "busy", TOO_EXPENSIVE: "price", SEND_INFO_ONLY: "sendInfo" };

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall back below */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

/** Structured call guide. Wording follows the prospect's language when known (else the UI locale), with a visible toggle. Suggestions only. */
export function CallGuide({ c, locale, prospectLanguage, software, objections }: { c: CallingCopy; locale: Locale; prospectLanguage: "FR" | "EN" | "UNKNOWN" | null; software: string | null; objections: string[] }) {
  const g = c.ws.guide;
  const [stage, setStage] = useState<GuideStage>("opening");
  const [lang, setLang] = useState<Locale>(prospectLanguage === "FR" ? "fr" : prospectLanguage === "EN" ? "en" : locale);
  const [status, setStatus] = useState("");
  const content = callingCopy(lang).ws.guide.content;
  const highlight = new Set<string>(objections.map((o) => OBJECTION_TO_ITEM[o]).filter(Boolean));
  if (software) highlight.add("haveSoftware");

  async function copy(text: string) {
    setStatus("");
    setStatus((await copyText(text)) ? g.copied : g.copyFailed);
  }

  return (
    <section aria-labelledby="guide-title" className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="guide-title" className="text-base font-semibold text-slate-900">{g.title}</h2>
        <div role="group" aria-label={g.language} className="flex rounded-lg border border-slate-300 p-0.5">
          {(["en", "fr"] as const).map((l) => (
            <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} lang={l}
              className={`min-h-9 min-w-11 rounded-md px-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-300 ${lang === l ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}>
              {l.toUpperCase()}<span className="sr-only"> — {g.language}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-500">{g.note}</p>
      <nav aria-label={g.stagesLabel} className="flex flex-wrap gap-1">
        {GUIDE_STAGES.map((s, i) => (
          <button key={s} type="button" aria-pressed={stage === s} aria-controls={`guide-stage-${s}`} onClick={() => setStage(s)}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-300 ${stage === s ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
            <span aria-hidden="true" className="text-xs text-slate-400">{i + 1}</span>{g.stages[s]}
          </button>
        ))}
      </nav>
      {GUIDE_STAGES.map((s) => {
        const st = content[s];
        return (
          <div key={s} id={`guide-stage-${s}`} hidden={stage !== s} lang={lang} className="space-y-2">
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{st.tip}</p>
            {s === "objections" && software && <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">{fill(g.softwareHint, { software })}</p>}
            <ul className="space-y-1.5">
              {Object.entries(st.items).map(([k, item]) => {
                const hot = s === "objections" && highlight.has(k);
                return (
                  <li key={k} className={`flex items-start gap-2 rounded-lg border p-2.5 ${hot ? "border-blue-400 bg-blue-50/60" : k === "dnc" ? "border-red-200 bg-red-50/60" : "border-slate-200"}`}>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium text-slate-900">{item.label}{hot && <> <Badge tone="bg-blue-100 text-blue-800">{g.mentioned}</Badge></>}</p>
                      <p className="mt-0.5 text-slate-700">{item.text}</p>
                    </div>
                    <button type="button" onClick={() => void copy(item.text)} title={g.copyPhrase}
                      className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-300">
                      <CopyIcon className="size-3.5" />{g.copy}<span className="sr-only">: {item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      <p role="status" aria-live="polite" className="text-xs text-emerald-700">{status}</p>
    </section>
  );
}

