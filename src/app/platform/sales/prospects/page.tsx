import Link from "next/link";
import { listAssignableStaff, listProspects, type ProspectFilters } from "@/lib/sales-crm/queries";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { effectiveScore } from "@/domain/sales-crm/scoring";
import { PLATFORM } from "@/lib/routes";
import { Badge, EmptyState, LanguageBadge, PageHeader, Pager, PermissionDenied, ScorePill, StageBadge, btnPrimary, btnSecondary, cardCls, formatDate, inputCls, labelCls } from "@/components/sales-crm/ui";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ProspectsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { actor, t, locale } = await loadCrmPage("read_assigned_prospects");
  if (!actor) return <PermissionDenied t={t} />;
  const sp = await searchParams;
  const filters: ProspectFilters = {
    q: one(sp.q), status: one(sp.status) === "ARCHIVED" ? "ARCHIVED" : "ACTIVE", stage: one(sp.stage) || undefined, owner: one(sp.owner) || undefined,
    language: one(sp.language) || undefined, source: one(sp.source) || undefined, industry: one(sp.industry) || undefined, dnc: one(sp.dnc) === "1",
    sort: (["name", "created", "activity"].includes(one(sp.sort)) ? one(sp.sort) : "activity") as ProspectFilters["sort"],
    dir: one(sp.dir) === "asc" ? "asc" : "desc", page: Number(one(sp.page)) || 1,
  };
  const [result, staff] = await Promise.all([listProspects(actor, filters), listAssignableStaff(actor)]);
  const p = t.prospects;
  const qs = (over: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const base: Record<string, string | undefined> = { q: filters.q, status: filters.status === "ARCHIVED" ? "ARCHIVED" : undefined, stage: filters.stage, owner: filters.owner, language: filters.language, source: filters.source, industry: filters.industry, dnc: filters.dnc ? "1" : undefined, sort: filters.sort, dir: filters.dir };
    for (const [k, v] of Object.entries({ ...base, ...over })) if (v !== undefined && v !== "") params.set(k, String(v));
    return `${PLATFORM.salesProspects}?${params.toString()}`;
  };
  const hasFilters = !!(filters.q || filters.stage || filters.owner || filters.language || filters.source || filters.industry || filters.dnc || filters.status === "ARCHIVED");
  const sortLink = (key: string, label: string) => {
    const active = filters.sort === key;
    const nextDir = active && filters.dir === "asc" ? "desc" : "asc";
    return <Link href={qs({ sort: key, dir: nextDir, page: 1 })} className={`font-medium ${active ? "text-blue-700" : "text-slate-600"}`} aria-sort={active ? (filters.dir === "asc" ? "ascending" : "descending") : "none"}>{label}{active ? (filters.dir === "asc" ? " ↑" : " ↓") : ""}</Link>;
  };
  const showOwnerFilter = actor.all || actor.kind === "SALES_MANAGER";

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title={p.title} subtitle={`${result.total} ${t.common.results}`} actions={<>
        <Link href={PLATFORM.salesProspectNew} className={btnPrimary}>{p.new}</Link>
        <Link href={PLATFORM.salesProspectImport} className={btnSecondary}>{p.import}</Link>
      </>} />

      <form method="get" className={`${cardCls} grid gap-3 sm:grid-cols-2 lg:grid-cols-4`}>
        <label className={`${labelCls} sm:col-span-2`}>{t.common.search}
          <input className={inputCls} type="search" name="q" defaultValue={filters.q} placeholder={p.searchPlaceholder} maxLength={80} />
        </label>
        <label className={labelCls}>{t.common.stage}
          <select className={inputCls} name="stage" defaultValue={filters.stage ?? ""}><option value="">{p.anyStage}</option>{Object.entries(t.stages).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        {showOwnerFilter && (
          <label className={labelCls}>{p.ownerFilter}
            <select className={inputCls} name="owner" defaultValue={filters.owner ?? ""}><option value="">{p.allOwners}</option><option value="none">{t.common.unassigned}</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </label>
        )}
        <label className={labelCls}>{t.common.language}
          <select className={inputCls} name="language" defaultValue={filters.language ?? ""}><option value="">{p.anyLanguage}</option>{Object.entries(t.languages).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label className={labelCls}>{t.common.source}
          <select className={inputCls} name="source" defaultValue={filters.source ?? ""}><option value="">{p.anySource}</option>{Object.entries(t.sources).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label className={labelCls}>{t.prospects.form.industry}
          <select className={inputCls} name="industry" defaultValue={filters.industry ?? ""}><option value="">{p.anyIndustry}</option>{Object.entries(t.industries).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label className={labelCls}>{t.common.status}
          <select className={inputCls} name="status" defaultValue={filters.status}><option value="ACTIVE">{t.staffStatus.ACTIVE}</option><option value="ARCHIVED">{p.archived}</option></select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="dnc" value="1" defaultChecked={filters.dnc} className="h-4 w-4" /> {p.dnc}</label>
        <input type="hidden" name="sort" value={filters.sort} /><input type="hidden" name="dir" value={filters.dir} />
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <button className={btnPrimary}>{t.common.apply}</button>
          {hasFilters && <Link href={PLATFORM.salesProspects} className={btnSecondary}>{t.common.clear}</Link>}
        </div>
      </form>

      {result.rows.length === 0 ? (
        <EmptyState title={hasFilters ? p.emptyFiltered : t.states.emptyProspects} hint={hasFilters ? undefined : t.states.emptyProspectsHint}
          action={hasFilters ? undefined : <Link href={PLATFORM.salesProspectNew} className={btnPrimary}>{p.new}</Link>} />
      ) : (<>
        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">{sortLink("name", p.sort.name)}</th>
                <th scope="col" className="px-3 py-3">{p.contact}</th>
                <th scope="col" className="px-3 py-3">{t.common.stage}</th>
                <th scope="col" className="px-3 py-3">{p.fit} / {p.intent}</th>
                <th scope="col" className="px-3 py-3">{t.common.owner}</th>
                <th scope="col" className="px-3 py-3">{sortLink("activity", p.sort.activity)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.rows.map((r) => {
                const o = r.opportunities[0];
                const fit = o ? effectiveScore(o.fitScore, o.fitScoreOverride) : null, intent = o ? effectiveScore(o.intentScore, o.intentScoreOverride) : null;
                return (
                  <tr key={r.id} className="align-top hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={PLATFORM.salesProspect(r.id)} className="break-words font-medium text-blue-700 hover:underline">{r.name}</Link>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <span>{[r.city, r.province].filter(Boolean).join(", ") || t.common.none}</span><LanguageBadge language={r.preferredLanguage} t={t} />
                        {r.doNotContact && <Badge tone="bg-red-100 text-red-800">{t.prospects.detail.doNotContactBanner}</Badge>}
                        {r.overdue && <Badge tone="bg-rose-100 text-rose-800">{p.overdue}</Badge>}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{r.contacts[0]?.name ?? t.common.none}</td>
                    <td className="px-3 py-3">{o ? <StageBadge stage={o.stage} t={t} /> : t.common.none}</td>
                    <td className="px-3 py-3"><div className="flex flex-wrap gap-1">{fit && <ScorePill value={fit.value} overridden={fit.overridden} label={p.fit} t={t} />}{intent && <ScorePill value={intent.value} overridden={intent.overridden} label={p.intent} t={t} />}</div></td>
                    <td className="px-3 py-3 text-slate-700">{r.assignedStaff ? <>{r.assignedStaff.user.name}{r.assignedStaff.status === "INACTIVE" && <span className="text-xs text-amber-700"> ({t.common.inactive})</span>}</> : <span className="text-slate-400">{t.common.unassigned}</span>}</td>
                    <td className="px-3 py-3 text-slate-500">{formatDate(r.lastActivityAt, locale)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ul className="space-y-3 md:hidden">
          {result.rows.map((r) => {
            const o = r.opportunities[0];
            const fit = o ? effectiveScore(o.fitScore, o.fitScoreOverride) : null, intent = o ? effectiveScore(o.intentScore, o.intentScoreOverride) : null;
            return (
              <li key={r.id} className={cardCls}>
                <Link href={PLATFORM.salesProspect(r.id)} className="break-words text-base font-semibold text-blue-700">{r.name}</Link>
                <p className="mt-0.5 text-sm text-slate-500">{[r.city, r.province].filter(Boolean).join(", ") || t.common.none} · {r.contacts[0]?.name ?? t.common.none}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {o && <StageBadge stage={o.stage} t={t} />}<LanguageBadge language={r.preferredLanguage} t={t} />
                  {fit && <ScorePill value={fit.value} overridden={fit.overridden} label={p.fit} t={t} />}{intent && <ScorePill value={intent.value} overridden={intent.overridden} label={p.intent} t={t} />}
                  {r.overdue && <Badge tone="bg-rose-100 text-rose-800">{p.overdue}</Badge>}{r.doNotContact && <Badge tone="bg-red-100 text-red-800">{t.prospects.detail.doNotContactBanner}</Badge>}
                </div>
                <p className="mt-2 text-xs text-slate-500">{r.assignedStaff?.user.name ?? t.common.unassigned} · {formatDate(r.lastActivityAt, locale)}</p>
              </li>
            );
          })}
        </ul>
        <div className="md:hidden text-sm text-slate-600">{sortLink("name", p.sort.name)} · {sortLink("created", p.sort.created)} · {sortLink("activity", p.sort.activity)}</div>
        <Pager page={result.page} pages={result.pages} hrefFor={(n) => qs({ page: n })} t={t} />
      </>)}
    </div>
  );
}
