import Link from "next/link";
import { listStaff } from "@/lib/sales-crm/queries";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { can } from "@/domain/sales-crm/access";
import { PLATFORM } from "@/lib/routes";
import { Badge, EmptyState, PageHeader, PermissionDenied, btnPrimary, cardCls, formatDate } from "@/components/sales-crm/ui";

export default async function TeamPage() {
  const { actor, t, locale } = await loadCrmPage("view_team_reporting");
  if (!actor) return <PermissionDenied t={t} />;
  const staff = await listStaff(actor);
  const m = t.team;
  const manage = can(actor, "manage_team");
  const tone = (s: string) => (s === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : s === "INVITED" ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-700");
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title={m.title} subtitle={manage ? m.subtitle : m.readOnly} actions={manage ? <Link href={PLATFORM.salesTeamNew} className={btnPrimary}>{m.new}</Link> : undefined} />
      {staff.length === 0 ? <EmptyState title={t.states.emptyTeam} action={manage ? <Link href={PLATFORM.salesTeamNew} className={btnPrimary}>{m.new}</Link> : undefined} /> : (<>
        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
              <th scope="col" className="px-4 py-3">{m.name}</th><th scope="col" className="px-3 py-3">{m.role}</th><th scope="col" className="px-3 py-3">{t.common.status}</th>
              <th scope="col" className="px-3 py-3">{m.manager}</th><th scope="col" className="px-3 py-3">{m.prospects}</th><th scope="col" className="px-3 py-3">{m.openTasks}</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">{staff.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-3"><Link href={PLATFORM.salesTeamMember(s.id)} className="font-medium text-blue-700 hover:underline">{s.user.name}</Link><p className="break-all text-xs text-slate-500">{s.user.email}</p></td>
                <td className="px-3 py-3">{t.staffRoles[s.role]}</td><td className="px-3 py-3"><Badge tone={tone(s.status)}>{t.staffStatus[s.status]}</Badge></td>
                <td className="px-3 py-3">{s.manager?.user.name ?? t.common.none}</td><td className="px-3 py-3 tabular-nums">{s._count.prospects}</td><td className="px-3 py-3 tabular-nums">{s._count.tasks}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <ul className="space-y-3 md:hidden">{staff.map((s) => (
          <li key={s.id} className={cardCls}>
            <Link href={PLATFORM.salesTeamMember(s.id)} className="break-words text-base font-semibold text-blue-700">{s.user.name}</Link>
            <p className="break-all text-xs text-slate-500">{s.user.email}</p>
            <div className="mt-2 flex flex-wrap gap-1.5"><Badge>{t.staffRoles[s.role]}</Badge><Badge tone={tone(s.status)}>{t.staffStatus[s.status]}</Badge></div>
            <p className="mt-2 text-xs text-slate-500">{m.prospects}: {s._count.prospects} · {m.openTasks}: {s._count.tasks}{s.activatedAt ? ` · ${m.lastLoginNote} ${formatDate(s.activatedAt, locale)}` : ""}</p>
          </li>
        ))}</ul>
      </>)}
    </div>
  );
}
