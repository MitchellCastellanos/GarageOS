import Link from "next/link";
import { notFound } from "next/navigation";
import { verifySnapshot, type EvidenceSnapshot } from "@/domain/lead-radar/casl-evidence-engine";
import { db } from "@/lib/db";
import { PLATFORM } from "@/lib/routes";
import { loadRadarPage } from "@/lib/lead-radar/page";
import { Badge, cardCls, formatDate, PageHeader, PermissionDenied } from "@/components/sales-crm/ui";

export const dynamic = "force-dynamic";

const L = {
  en: { back: "Automation", title: "CASL evidence artifact", sub: "Read-only. What the automated engine saw, and why it decided.", outcome: "Outcome", rule: "Rule version", mailbox: "Mailbox class", observed: "Observed", expires: "Evidence good until", conditions: "Conditions", reasons: "Reasons",
    integrity: "Integrity", ok: "Hash verified: the stored artifact is exactly what was captured.", bad: "Hash does NOT match: the stored artifact was altered.", none: "No artifact is stored for this decision (nothing was proven, so nothing is kept).", artifact: "Artifact (sanitised; other people's addresses are redacted)", legal: "A product control, not legal advice. Whether this evidence meets CASL s.10(9)(b) is a legal judgment for counsel." },
  fr: { back: "Automatisation", title: "Artéfact de preuve LCAP", sub: "Lecture seule. Ce que le moteur automatisé a observé, et pourquoi il a décidé ainsi.", outcome: "Résultat", rule: "Version de la règle", mailbox: "Type de boîte", observed: "Observé le", expires: "Preuve valide jusqu’au", conditions: "Conditions", reasons: "Raisons",
    integrity: "Intégrité", ok: "Empreinte vérifiée : l’artéfact conservé est exactement celui qui a été capturé.", bad: "L’empreinte ne correspond PAS : l’artéfact conservé a été modifié.", none: "Aucun artéfact n’est conservé pour cette décision (rien n’a été prouvé, donc rien n’est gardé).", artifact: "Artéfact (assaini; les adresses d’autres personnes sont masquées)", legal: "Un contrôle de produit, pas un avis juridique. Savoir si cette preuve satisfait l’art. 10(9)b) de la LCAP est un jugement juridique pour un conseiller." },
} as const;

export default async function EvidencePage({ params }: { params: Promise<{ id: string }> }) {
  const { actor, access, locale, t } = await loadRadarPage("admin");
  if (!actor || !access?.admin) return <PermissionDenied t={t} />;
  const { id } = await params;
  const a = await db.crmCaslAssessment.findUnique({ where: { id } });
  if (!a) notFound();
  const k = L[locale];
  const snap = a.snapshot as unknown as EvidenceSnapshot | null;
  const verified = snap ? verifySnapshot(snap) && snap.snapshotHash === a.snapshotHash : null;
  const tone = a.outcome === "SUPPORTED" ? "bg-emerald-100 text-emerald-800" : a.outcome === "BLOCKED" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800";
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href={PLATFORM.salesLeadRadarAutomation} className="inline-flex min-h-11 items-center text-sm text-blue-700">← {k.back}</Link>
      <PageHeader title={k.title} subtitle={k.sub} />
      <section className={`${cardCls} space-y-3`}>
        <div className="flex flex-wrap items-center gap-2"><Badge tone={tone}>{a.outcome}</Badge><span className="break-all text-sm font-medium text-slate-900">{a.emailNormalized}</span></div>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-slate-500">{k.rule}</dt><dd>{a.ruleVersion}</dd></div>
          <div><dt className="text-xs text-slate-500">{k.mailbox}</dt><dd>{a.mailboxClass ?? "—"}</dd></div>
          <div><dt className="text-xs text-slate-500">{k.observed}</dt><dd>{a.observedAt ? formatDate(a.observedAt, locale) : "—"}</dd></div>
          <div><dt className="text-xs text-slate-500">{k.expires}</dt><dd>{a.expiresAt ? formatDate(a.expiresAt, locale) : "—"}</dd></div>
        </dl>
        <div><h3 className="text-sm font-medium text-slate-700">{k.conditions}</h3><pre className="mt-1 overflow-x-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify(a.conditions, null, 2)}</pre></div>
        {a.reasons.length > 0 && <div><h3 className="text-sm font-medium text-slate-700">{k.reasons}</h3><p className="mt-1 text-sm">{a.reasons.join(", ")}</p></div>}
      </section>
      <section className={`${cardCls} space-y-2`}>
        <h2 className="font-semibold text-slate-900">{k.integrity}</h2>
        {verified === null ? <p className="text-sm text-slate-600">{k.none}</p> : verified ? <p className="text-sm text-emerald-800">{k.ok}</p> : <p className="text-sm font-medium text-red-700">{k.bad}</p>}
        {snap && (<><h3 className="text-sm font-medium text-slate-700">{k.artifact}</h3><pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-2 text-xs">{JSON.stringify(snap, null, 2)}</pre></>)}
      </section>
      <p className="text-xs text-slate-500">{k.legal}</p>
    </div>
  );
}
