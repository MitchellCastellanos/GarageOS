import Link from "next/link";
import { PROVINCE_CODES, isProvinceCode } from "@/domain/lead-radar/geo";
import { INVENTORY_STATES, inventoryCounts, listInventory, nationalProgramReport, type InventoryFilter, type InventoryState } from "@/lib/lead-radar/inventory";
import { loadRadarPage } from "@/lib/lead-radar/page";
import { PLATFORM } from "@/lib/routes";
import { Badge, btnPrimary, btnSecondary, cardCls, formatDate, inputCls, labelCls, PageHeader, PermissionDenied } from "@/components/sales-crm/ui";

export const dynamic = "force-dynamic";
const PAGE = 50;

const COPY = {
  en: {
    title: "Qualified email contacts", subtitle: "The one campaign-selectable inventory. A contact is listed as available only while its CASL v3 evidence is current and it is not suppressed. This page sends nothing and enrolls no one.",
    back: "Lead Radar", headline: "Verified, currently eligible, campaign-selectable email contacts", report: "National program",
    r: ["Jurisdictions completed", "Source records processed", "Rejected by commercial screening", "Email candidates evaluated", "CASL SUPPORTED", "CASL INSUFFICIENT", "CASL BLOCKED", "Technical retries (transient + parked)", "Admitted and selectable", "National workload", "First-pass pending (waiting for a decision)", "Not yet CASL candidates (FIELD / unverified shop)"],
    status: { RUNNING: "Still running", COMPLETED: "Fully completed", NOT_RUNNING: "Not running" }, juris: "Jurisdictions (candidates staged · prospects)", throughput: "CASL checks completed in the last 24 h · avg seconds per address",
    jState: { COMPLETED: "Completed", COMPLETED_NO_CANDIDATES: "Completed, no candidates", HALTED: "Halted", IN_PROGRESS: "In progress", NOT_STARTED: "Not started" } as Record<string, string>, field: "FIELD prospects without email (separate field-sales view, never counted as email-ready)",
    f: { state: "Status", province: "Province", language: "Language", business: "Business", outreach: "Previous outreach", campaign: "Campaign history", any: "Any", apply: "Filter", reset: "Reset", expiring: "Evidence expires within (days)" },
    outreach: { NONE: "Never emailed", PREVIOUS: "Emailed before" }, campaign: { NONE: "Never enrolled", ENROLLED: "Enrolled before", ACTIVE: "In an active sequence" },
    th: ["Business", "Email", "Province", "Language", "Status", "Evidence expires", "Emails sent", "Enrollments"], none: "No contacts match.", total: "matching", prev: "Previous", next: "Next",
    state: { SELECTABLE: "Selectable", SUPPRESSED: "Suppressed / DNC", OUT_OF_SCOPE: "Business out of scope", REVOKED: "Evidence revoked", EXPIRED: "Evidence expired", STALE_RULE: "Needs revalidation (rule)", NOT_SUPPORTED: "No longer supported" } as Record<InventoryState, string>,
  },
  fr: {
    title: "Contacts courriel qualifiés", subtitle: "L'unique inventaire sélectionnable pour les campagnes. Un contact n'est disponible que tant que sa preuve LCAP v3 est valide et qu'il n'est pas supprimé. Cette page n'envoie rien et n'inscrit personne.",
    back: "Radar de prospects", headline: "Contacts courriel vérifiés, actuellement admissibles et sélectionnables", report: "Programme national",
    r: ["Juridictions terminées", "Enregistrements source traités", "Rejetés par le tri commercial", "Courriels candidats évalués", "LCAP SUPPORTED", "LCAP INSUFFICIENT", "LCAP BLOCKED", "Reprises techniques (transitoires + suspendues)", "Admis et sélectionnables", "Traitement national", "Première passe en attente de décision", "Pas encore candidats LCAP (TERRAIN / commerce non vérifié)"],
    status: { RUNNING: "En cours", COMPLETED: "Entièrement terminé", NOT_RUNNING: "Non démarré" }, juris: "Juridictions (candidats en zone d'attente · prospects)", throughput: "Vérifications LCAP terminées en 24 h · secondes moyennes par adresse",
    jState: { COMPLETED: "Terminé", COMPLETED_NO_CANDIDATES: "Terminé, aucun candidat", HALTED: "Arrêté", IN_PROGRESS: "En cours", NOT_STARTED: "Non démarré" } as Record<string, string>, field: "Prospects TERRAIN sans courriel (vue de vente terrain séparée, jamais comptés comme prêts par courriel)",
    f: { state: "Statut", province: "Province", language: "Langue", business: "Entreprise", outreach: "Envois antérieurs", campaign: "Historique de campagne", any: "Tous", apply: "Filtrer", reset: "Réinitialiser", expiring: "Preuve expire dans (jours)" },
    outreach: { NONE: "Jamais contacté", PREVIOUS: "Déjà contacté" }, campaign: { NONE: "Jamais inscrit", ENROLLED: "Déjà inscrit", ACTIVE: "Dans une séquence active" },
    th: ["Entreprise", "Courriel", "Province", "Langue", "Statut", "Preuve expire", "Courriels envoyés", "Inscriptions"], none: "Aucun contact ne correspond.", total: "correspondants", prev: "Précédent", next: "Suivant",
    state: { SELECTABLE: "Sélectionnable", SUPPRESSED: "Supprimé / DNC", OUT_OF_SCOPE: "Entreprise hors portée", REVOKED: "Preuve révoquée", EXPIRED: "Preuve expirée", STALE_RULE: "À revalider (règle)", NOT_SUPPORTED: "Plus soutenu" } as Record<InventoryState, string>,
  },
};

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { actor, access, locale, t } = await loadRadarPage("admin");
  if (!actor || !access) return <PermissionDenied t={t} />;
  const k = COPY[locale];
  const sp = await searchParams;
  const filter: InventoryFilter = {
    state: sp.state === "ANY" || INVENTORY_STATES.includes(sp.state as InventoryState) ? (sp.state as InventoryState | "ANY") : "SELECTABLE",
    province: sp.province && isProvinceCode(sp.province) ? sp.province : undefined,
    language: sp.language === "FR" || sp.language === "EN" || sp.language === "UNKNOWN" ? sp.language : undefined,
    business: sp.business?.slice(0, 80) || undefined,
    expiresWithinDays: sp.expiring ? Math.min(30, Math.max(1, Number(sp.expiring) || 0)) || undefined : undefined,
    outreach: sp.outreach === "NONE" || sp.outreach === "PREVIOUS" ? sp.outreach : undefined,
    campaign: sp.campaign === "NONE" || sp.campaign === "ENROLLED" || sp.campaign === "ACTIVE" ? sp.campaign : undefined,
    limit: PAGE, offset: Math.max(0, (Math.max(1, Number(sp.page) || 1) - 1) * PAGE),
  };
  const page = Math.max(1, Number(sp.page) || 1);
  const [report, counts, list] = await Promise.all([nationalProgramReport(), inventoryCounts(), listInventory(filter)]);
  const num = (n: number) => n.toLocaleString(locale === "fr" ? "fr-CA" : "en-CA");
  const nums = [`${report.jurisdictionsCompleted} / ${report.jurisdictionsTotal}`, num(report.sourceRecordsProcessed), num(report.rejectedByCommercialScreening), num(report.emailCandidatesEvaluated), num(report.supported), num(report.insufficient), num(report.blocked), num(report.technicalRetryBacklog), num(report.selectable), k.status[report.status], num(report.firstPassPending), num(report.notYetCaslCandidates)];
  const qs = (over: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    for (const [key, v] of Object.entries({ state: sp.state, province: sp.province, language: sp.language, business: sp.business, expiring: sp.expiring, outreach: sp.outreach, campaign: sp.campaign, ...over })) if (v !== undefined && v !== "") p.set(key, String(v));
    return `?${p.toString()}`;
  };
  const pages = Math.max(1, Math.ceil(list.total / PAGE));
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Link href={PLATFORM.salesLeadRadar} className="inline-flex min-h-11 items-center text-sm text-blue-700">← {k.back}</Link>
      <PageHeader title={k.title} subtitle={k.subtitle} />
      <section className={`${cardCls} text-center`} aria-label={k.headline}>
        <div className="text-xs text-slate-500">{k.headline}</div>
        <div className="text-4xl font-semibold text-slate-900">{num(counts.selectable)}</div>
        <div className="mt-1 text-xs text-slate-500">{Object.entries(counts.byProvince).sort().map(([p, n]) => `${p} ${num(n)}`).join(" · ") || "—"}</div>
      </section>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label={k.report}>
        {k.r.map((label, i) => <div key={label} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="text-lg font-semibold text-slate-900">{nums[i]}</dd></div>)}
      </dl>
      <section className={`${cardCls} text-sm`} aria-label={k.juris}>
        <h2 className="font-semibold text-slate-900">{k.juris}</h2>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {report.jurisdictions.map((j) => (
            <li key={j.province} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-2 py-1">
              <span className="font-medium">{j.province}</span>
              <span className="text-xs text-slate-500">{num(j.staged)} · {num(j.prospects)}</span>
              <Badge tone={j.state.startsWith("COMPLETED") ? "bg-emerald-100 text-emerald-800" : j.state === "HALTED" ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"}>{k.jState[j.state]}{j.haltCode ? ` · ${j.haltCode}` : ""}</Badge>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500">{k.throughput}: {num(report.evidenceLast24h.assessed)} / 24 h{report.evidenceLast24h.avgSecondsPerAddress !== null ? ` · ${report.evidenceLast24h.avgSecondsPerAddress} s` : ""}</p>
      </section>
      <p className="text-xs text-slate-500">{k.field}: {num(report.fieldProspectsWithoutEmail)}</p>
      <form method="get" className={`${cardCls} grid gap-3 sm:grid-cols-3 lg:grid-cols-4`}>
        <label className={labelCls}>{k.f.state}<select name="state" defaultValue={filter.state} className={inputCls}>{INVENTORY_STATES.map((s) => <option key={s} value={s}>{k.state[s]}</option>)}<option value="ANY">{k.f.any}</option></select></label>
        <label className={labelCls}>{k.f.province}<select name="province" defaultValue={filter.province ?? ""} className={inputCls}><option value="">{k.f.any}</option>{PROVINCE_CODES.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
        <label className={labelCls}>{k.f.language}<select name="language" defaultValue={filter.language ?? ""} className={inputCls}><option value="">{k.f.any}</option><option value="FR">FR</option><option value="EN">EN</option><option value="UNKNOWN">?</option></select></label>
        <label className={labelCls}>{k.f.business}<input name="business" defaultValue={filter.business ?? ""} className={inputCls} maxLength={80} /></label>
        <label className={labelCls}>{k.f.outreach}<select name="outreach" defaultValue={filter.outreach ?? ""} className={inputCls}><option value="">{k.f.any}</option><option value="NONE">{k.outreach.NONE}</option><option value="PREVIOUS">{k.outreach.PREVIOUS}</option></select></label>
        <label className={labelCls}>{k.f.campaign}<select name="campaign" defaultValue={filter.campaign ?? ""} className={inputCls}><option value="">{k.f.any}</option><option value="NONE">{k.campaign.NONE}</option><option value="ENROLLED">{k.campaign.ENROLLED}</option><option value="ACTIVE">{k.campaign.ACTIVE}</option></select></label>
        <label className={labelCls}>{k.f.expiring}<input name="expiring" type="number" min={1} max={30} defaultValue={filter.expiresWithinDays ?? ""} className={inputCls} /></label>
        <div className="flex items-end gap-2"><button type="submit" className={btnPrimary}>{k.f.apply}</button><Link href="?" className={btnSecondary}>{k.f.reset}</Link></div>
      </form>
      <p className="text-sm text-slate-600">{num(list.total)} {k.total}</p>
      {list.rows.length === 0 ? <p className={`${cardCls} text-sm text-slate-600`}>{k.none}</p> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500"><tr>{k.th.map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {list.rows.map((r) => (
                <tr key={r.contactId}>
                  <td className="px-3 py-2"><Link className="font-medium text-blue-700 hover:underline" href={PLATFORM.salesProspect(r.prospectId)}>{r.business}</Link><div className="text-xs text-slate-500">{r.city ?? ""}</div></td>
                  <td className="px-3 py-2 break-all">{r.email}{r.evidenceUrl ? <div className="text-xs text-slate-500 break-all">{r.evidenceUrl}</div> : null}</td>
                  <td className="px-3 py-2">{r.province ?? "—"}</td><td className="px-3 py-2">{r.language}</td>
                  <td className="px-3 py-2"><Badge tone={r.state === "SELECTABLE" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>{k.state[r.state]}</Badge></td>
                  <td className="px-3 py-2">{r.evidenceExpiresAt ? formatDate(r.evidenceExpiresAt, locale) : "—"}</td><td className="px-3 py-2">{r.messagesSent}</td><td className="px-3 py-2">{r.enrollments}{r.activeEnrollments ? ` (${r.activeEnrollments})` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav className="flex items-center justify-between text-sm" aria-label="pagination">
        {page > 1 ? <Link className={btnSecondary} href={qs({ page: page - 1 })}>{k.prev}</Link> : <span />}
        <span className="text-slate-500">{page} / {pages}</span>
        {page < pages ? <Link className={btnSecondary} href={qs({ page: page + 1 })}>{k.next}</Link> : <span />}
      </nav>
    </div>
  );
}
