import Link from "next/link";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { commsCopy } from "@/lib/admin-locale/sales-comms";
import { PLATFORM } from "@/lib/routes";
import { Badge, EmptyState, PageHeader, PermissionDenied, Pager, btnPrimary, btnSecondary, cardCls, formatDate, inputCls } from "@/components/sales-crm/ui";
import { INBOX_VIEWS, listThreads, type InboxView } from "@/lib/sales-comms/queries";
import { InboxRealtime } from "@/components/sales-comms/InboxRealtime";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function SalesInboxPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { actor, t: crm, locale } = await loadCrmPage("send_sales_email");
  if (!actor) return <PermissionDenied t={crm} />;
  const t = commsCopy(locale);
  const sp = await searchParams;
  const view = (INBOX_VIEWS as string[]).includes(one(sp.view)) ? (one(sp.view) as InboxView) : "all";
  const q = one(sp.q);
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const { rows, pages, total } = await listThreads(actor, { view, q, page });
  const href = (v: string, p = 1) => `${PLATFORM.salesInbox}?view=${v}${q ? `&q=${encodeURIComponent(q)}` : ""}${p > 1 ? `&page=${p}` : ""}`;
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title={t.inbox.title} subtitle={t.inbox.subtitle} actions={<Link className={btnPrimary} href={PLATFORM.salesCompose}>{t.inbox.compose}</Link>} />
      <InboxRealtime userId={actor.userId} locale={locale} />
      <nav className="flex flex-wrap gap-2" aria-label={t.inbox.title}>
        {INBOX_VIEWS.map((v) => <Link key={v} href={href(v)} className={view === v ? btnPrimary : btnSecondary} aria-current={view === v ? "page" : undefined}>{t.inbox.filters[v]}</Link>)}
      </nav>
      <form method="get" className="flex gap-2" role="search">
        <input type="hidden" name="view" value={view} />
        <input name="q" defaultValue={q} className={inputCls} placeholder={t.inbox.search} aria-label={t.inbox.search} maxLength={80} />
        <button className={btnSecondary}>{t.common.search}</button>
      </form>
      {rows.length === 0 ? <EmptyState title={t.inbox.empty} hint={t.inbox.emptyHint} /> : (
        <ul className="space-y-2" aria-label={`${total} ${t.inbox.title}`}>
          {rows.map((th) => {
            const last = th.messages[0];
            const unread = th.lastInboundAt && !th.ownerSeenAt && actor.staffId === th.ownerStaffId;
            return (
              <li key={th.id}>
                <Link href={PLATFORM.salesThread(th.id)} className={`${cardCls} block hover:border-blue-300 ${unread ? "border-blue-300 bg-blue-50/40" : ""}`}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={`min-w-0 flex-1 break-words ${unread ? "font-semibold" : "font-medium"} text-slate-900`}>{th.subject || t.inbox.noSubject}</span>
                    <span className="text-xs text-slate-500">{formatDate(th.lastMessageAt, locale, true)}</span>
                  </div>
                  <p className="mt-0.5 break-words text-sm text-slate-600">
                    {th.prospect?.name ?? th.counterpartyEmail ?? "—"}{th.contact ? ` · ${th.contact.name}` : ""}
                  </p>
                  {last?.bodyText && <p className="mt-1 line-clamp-2 break-words text-sm text-slate-500">{last.bodyText.replace(/\s+/g, " ").slice(0, 200)}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                    {unread && <Badge tone="bg-blue-100 text-blue-800">{t.inbox.unreadBadge}</Badge>}
                    {th.needsReply && th.status === "OPEN" && <Badge tone="bg-amber-100 text-amber-800">{t.inbox.needsReplyBadge}</Badge>}
                    {last && <Badge>{last.direction === "INBOUND" ? t.status.RECEIVED : t.status[last.status] ?? last.status}</Badge>}
                    {!th.prospectId && <Badge tone="bg-slate-200 text-slate-700">{t.inbox.unlinked}</Badge>}
                    <span className="text-slate-500">{t.inbox.assignedTo}: {th.owner ? (th.owner.displayName ?? th.owner.user.name) : t.common.unassigned}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Pager page={page} pages={pages} hrefFor={(p) => href(view, p)} t={crm} />
    </div>
  );
}
