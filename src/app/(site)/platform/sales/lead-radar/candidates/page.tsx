import Link from "next/link";
import { PROVINCE_CODES, PROVINCE_NAMES } from "@/domain/lead-radar/geo";
import { CATEGORY_GROUPS } from "@/domain/lead-radar/taxonomy";
import { PLATFORM } from "@/lib/routes";
import { fill } from "@/lib/admin-locale/lead-radar";
import { candidateFilterSchema, listCandidates, PAGE_SIZE } from "@/lib/lead-radar/candidates";
import { loadRadarPage } from "@/lib/lead-radar/page";
import { db } from "@/lib/db";
import { btnPrimary, btnSecondary, cardCls, EmptyState, inputCls, labelCls, PageHeader, Pager, PermissionDenied } from "@/components/sales-crm/ui";
import { nationalCopy } from "@/lib/admin-locale/lead-radar-national";
import { CandidateTable } from "@/components/lead-radar/CandidateTable";

export const dynamic = "force-dynamic";

export default async function CandidatesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { actor, locale, t, c } = await loadRadarPage("review");
  if (!actor) return <PermissionDenied t={t} />;
  const sp = await searchParams;
  const f = candidateFilterSchema.parse(sp);
  const k = c.candidates;
  const [list, approvedCount] = await Promise.all([
    listCandidates(actor, f),
    db.crmDiscoveryCandidate.count({ where: { reviewState: "APPROVED", importState: { in: ["NOT_IMPORTED", "FAILED"] }, licenseOk: true, tier: { not: "EXCLUDED" }, duplicateOfCandidateId: null, ...(f.province ? { province: f.province } : {}) } }),
  ]);
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const qs = (page: number) => { const p = new URLSearchParams(Object.entries(sp).filter(([key, v]) => v && key !== "page") as [string, string][]); p.set("page", String(page)); return `${PLATFORM.salesLeadRadarCandidates}?${p}`; };
  const sel = (name: keyof typeof f, label: string, options: [string, string][], all: string) => (
    <label className={labelCls}>{label}
      <select name={name} defaultValue={(f[name] as string | undefined) ?? ""} className={inputCls}><option value="">{all}</option>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
    </label>
  );
  const chk = (name: "hasPhone" | "hasWebsite" | "hasEmail" | "licenseBlocked", label: string) => (
    <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700"><input type="checkbox" name={name} value="1" defaultChecked={!!f[name]} className="size-5" />{label}</label>
  );
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Link href={PLATFORM.salesLeadRadar} className="inline-flex min-h-11 items-center text-sm text-blue-700">← {c.runs.back}</Link>
      <PageHeader title={k.title} subtitle={fill(k.results, { n: list.total })} />
      <form method="get" className={`${cardCls} space-y-3`} aria-label={k.apply}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className={labelCls}>{k.search}<input name="q" defaultValue={f.q ?? ""} className={inputCls} maxLength={80} /></label>
          {sel("province", k.province, PROVINCE_CODES.map((p) => [p, PROVINCE_NAMES[p][locale]]), k.allProvinces)}
          <label className={labelCls}>{k.city}<input name="city" defaultValue={f.city ?? ""} className={inputCls} maxLength={80} /></label>
          {sel("tier", k.tier, Object.entries(k.tiers), k.allTiers)}
          {sel("group", k.category, CATEGORY_GROUPS.map((g) => [g, c.controls.groups[g]]), k.allCategories)}
          {sel("review", k.review, Object.entries(k.reviewStates), k.allReview)}
          {sel("match", k.match, Object.entries(k.matchStates), k.allMatch)}
          {sel("imp", k.imp, Object.entries(k.importStates), k.allImp)}
          {sel("fit", nationalCopy(locale).fit.label, [...Object.entries(nationalCopy(locale).fit.values), ["NONE", nationalCopy(locale).fit.none]], nationalCopy(locale).fit.any)}
          {sel("chain", k.chain, Object.entries(k.chainSignals), k.anyChain)}
          {sel("lane", k.lane, Object.entries(c.automation.policy.lanes).filter(([l]) => l !== "OUT_OF_SCOPE"), k.anyLane)}
          {sel("reason", k.reason, Object.entries(c.automation.qualification.reasons), k.anyReason)}
          <label className={labelCls}>{k.minCompleteness}<input name="minCompleteness" type="number" min={0} max={100} step={5} defaultValue={f.minCompleteness ?? ""} className={inputCls} /></label>
        </div>
        <div className="flex flex-wrap gap-x-4">{chk("hasPhone", k.hasPhone)}{chk("hasWebsite", k.hasWebsite)}{chk("hasEmail", k.hasEmail)}{chk("licenseBlocked", k.licenseBlocked)}</div>
        <div className="flex gap-2"><button className={btnPrimary} type="submit">{k.apply}</button><Link className={btnSecondary} href={PLATFORM.salesLeadRadarCandidates}>{k.reset}</Link></div>
      </form>
      {list.rows.length === 0 ? <EmptyState title={k.empty} /> : <CandidateTable locale={locale} rows={list.rows} approvedCount={approvedCount} province={f.province} />}
      <Pager page={list.page} pages={pages} hrefFor={qs} t={t} />
    </div>
  );
}
