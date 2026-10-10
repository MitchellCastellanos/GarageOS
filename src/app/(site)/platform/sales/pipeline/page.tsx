import Link from "next/link";
import { listAssignableStaff, pipelineBoard } from "@/lib/sales-crm/queries";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { BOARD_STAGES } from "@/domain/sales-crm/pipeline";
import { PLATFORM } from "@/lib/routes";
import { Badge, EmptyState, LanguageBadge, PageHeader, PermissionDenied, ScorePill, StageBadge, btnPrimary, btnSecondary, cardCls, formatDate, inputCls } from "@/components/sales-crm/ui";
import { StageControl } from "@/components/sales-crm/StageControl";

const COLUMN_LIMIT = 40;
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function PipelinePage({ searchParams }: { searchParams: Promise<SP> }) {
  const { actor, t, locale } = await loadCrmPage("read_assigned_prospects");
  if (!actor) return <PermissionDenied t={t} />;
  const sp = await searchParams;
  const view = one(sp.view) === "table" ? "table" : "board";
  const owner = one(sp.owner) || undefined;
  const [board, staff] = await Promise.all([pipelineBoard(actor, owner), listAssignableStaff(actor)]);
  const p = t.pipeline;
  const now = new Date();
  const href = (over: Record<string, string>) => `${PLATFORM.salesPipeline}?${new URLSearchParams({ ...(owner ? { owner } : {}), view, ...over }).toString()}`;
  const showOwner = actor.all || actor.kind === "SALES_MANAGER";
  const closedTotal = Object.values(board.closedCounts).reduce((a, b) => a + b, 0);

  const card = (c: (typeof board.cards)[number]) => {
    const overdue = c.nextDueAt && c.nextDueAt < now;
    return (
      <li key={c.id} className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <Link href={PLATFORM.salesProspect(c.prospect.id)} className="block break-words text-sm font-semibold text-blue-700 hover:underline">{c.prospect.name}</Link>
        <div className="flex flex-wrap items-center gap-1.5">
          <LanguageBadge language={c.prospect.preferredLanguage} t={t} />
          <ScorePill value={c.fit} label={t.prospects.fit} t={t} /><ScorePill value={c.intent} label={t.prospects.intent} t={t} />
        </div>
        <p className="text-xs text-slate-500">{c.assignedStaff?.user.name ?? t.common.unassigned}{c.prospect.city ? ` · ${c.prospect.city}` : ""}</p>
        <p className={`text-xs ${overdue ? "font-medium text-rose-700" : "text-slate-500"}`}>{c.nextDueAt ? `${p.nextTask}: ${formatDate(c.nextDueAt, locale)}${overdue ? ` · ${t.tasks.overdue}` : ""}` : p.noTask}</p>
        <details><summary className="flex min-h-11 cursor-pointer items-center text-xs font-medium text-slate-600">{p.moveTo}…</summary><div className="pt-1"><StageControl locale={locale} opportunityId={c.id} stage={c.stage} compact /></div></details>
      </li>
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader title={p.title} subtitle={`${board.cards.length} ${p.cardsCount}`} actions={<Link href={PLATFORM.salesProspectNew} className={btnPrimary}>{t.prospects.new}</Link>} />
      <div className="flex flex-wrap items-center gap-2">
        <Link href={href({ view: "board" })} className={view === "board" ? btnPrimary : btnSecondary} aria-current={view === "board" ? "page" : undefined}>{p.board}</Link>
        <Link href={href({ view: "table" })} className={view === "table" ? btnPrimary : btnSecondary} aria-current={view === "table" ? "page" : undefined}>{p.table}</Link>
        {showOwner && (
          <form method="get" className="ml-auto flex items-center gap-2">
            <input type="hidden" name="view" value={view} />
            <select name="owner" defaultValue={owner ?? ""} className={`${inputCls} w-auto`} aria-label={p.owner}>
              <option value="">{p.everyone}</option><option value="none">{t.common.unassigned}</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button className={btnSecondary}>{t.common.apply}</button>
          </form>
        )}
      </div>
      {board.truncated && <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{p.truncated}</p>}

      {board.cards.length === 0 ? <EmptyState title={t.states.emptyPipeline} /> : view === "board" ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
          <div className="flex gap-3" style={{ minWidth: "max-content" }}>
            {BOARD_STAGES.map((stage) => {
              const col = board.cards.filter((c) => c.stage === stage);
              return (
                <section key={stage} className="w-72 flex-shrink-0 rounded-xl bg-slate-100 p-2.5 sm:w-64" aria-label={t.stages[stage]}>
                  <h2 className="mb-2 flex items-center justify-between px-1 text-sm font-semibold text-slate-800">{t.stages[stage]}<Badge>{col.length}</Badge></h2>
                  <ul className="space-y-2">{col.slice(0, COLUMN_LIMIT).map(card)}</ul>
                  {col.length > COLUMN_LIMIT && <p className="px-1 pt-2 text-xs text-slate-500">+{col.length - COLUMN_LIMIT} — <Link className="text-blue-700" href={href({ view: "table" })}>{p.table}</Link></p>}
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
              <th scope="col" className="px-4 py-3">{t.nav.prospects}</th><th scope="col" className="px-3 py-3">{t.common.stage}</th><th scope="col" className="px-3 py-3">{t.prospects.fit} / {t.prospects.intent}</th>
              <th scope="col" className="px-3 py-3">{p.owner}</th><th scope="col" className="px-3 py-3">{p.nextTask}</th><th scope="col" className="px-3 py-3">{p.moveTo}</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">{board.cards.map((c) => (
              <tr key={c.id} className="align-top">
                <td className="px-4 py-3"><Link href={PLATFORM.salesProspect(c.prospect.id)} className="font-medium text-blue-700 hover:underline">{c.prospect.name}</Link></td>
                <td className="px-3 py-3"><StageBadge stage={c.stage} t={t} /></td>
                <td className="px-3 py-3"><div className="flex flex-wrap gap-1"><ScorePill value={c.fit} label={t.prospects.fit} t={t} /><ScorePill value={c.intent} label={t.prospects.intent} t={t} /></div></td>
                <td className="px-3 py-3">{c.assignedStaff?.user.name ?? t.common.unassigned}</td>
                <td className={`px-3 py-3 ${c.nextDueAt && c.nextDueAt < now ? "font-medium text-rose-700" : "text-slate-600"}`}>{c.nextDueAt ? formatDate(c.nextDueAt, locale) : p.noTask}</td>
                <td className="px-3 py-3 min-w-56"><StageControl locale={locale} opportunityId={c.id} stage={c.stage} compact /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {closedTotal > 0 && (
        <section className={cardCls}>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">{p.closed}</h2>
          <div className="flex flex-wrap gap-2">{Object.entries(board.closedCounts).map(([stage, n]) => <span key={stage} className="inline-flex items-center gap-1.5"><StageBadge stage={stage} t={t} /><b>{n}</b></span>)}</div>
        </section>
      )}
    </div>
  );
}
