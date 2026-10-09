import Link from "next/link";
import { listAssignableStaff, listTasks, type TaskView } from "@/lib/sales-crm/queries";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { PLATFORM } from "@/lib/routes";
import { Badge, EmptyState, PageHeader, PermissionDenied, btnPrimary, btnSecondary, cardCls, formatDate, inputCls } from "@/components/sales-crm/ui";
import { TaskActions } from "@/components/sales-crm/TaskActions";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const VIEWS: TaskView[] = ["open", "overdue", "today", "upcoming", "done"];

export default async function TasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { actor, t, locale } = await loadCrmPage("read_assigned_prospects");
  if (!actor) return <PermissionDenied t={t} />;
  const sp = await searchParams;
  const view = (VIEWS as string[]).includes(one(sp.view)) ? (one(sp.view) as TaskView) : "open";
  const owner = one(sp.owner) || (actor.all || actor.kind === "SALES_MANAGER" ? (actor.staffId ? "mine" : "all") : "mine");
  const [tasks, staff] = await Promise.all([listTasks(actor, { view, owner }), listAssignableStaff(actor)]);
  const now = new Date();
  const link = (v: string, o = owner) => `${PLATFORM.salesTasks}?view=${v}&owner=${o}`;
  const multi = actor.all || actor.kind === "SALES_MANAGER";
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title={t.tasks.title} />
      <nav className="flex flex-wrap gap-2" aria-label={t.tasks.view}>
        {VIEWS.map((v) => <Link key={v} href={link(v)} className={view === v ? btnPrimary : btnSecondary} aria-current={view === v ? "page" : undefined}>{t.taskViews[v]}</Link>)}
      </nav>
      {multi && (
        <form method="get" className="flex items-center gap-2">
          <input type="hidden" name="view" value={view} />
          <select name="owner" defaultValue={owner} className={`${inputCls} w-auto`} aria-label={t.tasks.assignee}>
            {actor.staffId && <option value="mine">{t.tasks.mine}</option>}<option value="all">{t.tasks.everyone}</option>
            {staff.filter((s) => s.id !== actor.staffId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className={btnSecondary}>{t.common.apply}</button>
        </form>
      )}
      {tasks.length === 0 ? <EmptyState title={t.states.emptyTasks} /> : (
        <ul className="space-y-3">
          {tasks.map((task) => {
            const overdue = task.status === "OPEN" && task.dueAt < now;
            return (
              <li key={task.id} className={`${cardCls} flex flex-wrap items-start justify-between gap-3 ${overdue ? "border-rose-300 bg-rose-50" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className={`break-words font-medium ${task.status !== "OPEN" ? "text-slate-400 line-through" : "text-slate-900"}`}>{task.title}</p>
                  <p className="text-sm"><Link href={PLATFORM.salesProspect(task.prospect.id)} className="break-words text-blue-700 hover:underline">{task.prospect.name}</Link></p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    <Badge>{t.taskTypes[task.type]}</Badge><Badge>{t.levels[task.priority]}</Badge>
                    <span>{task.status === "DONE" ? `${t.tasks.completedAt} ${formatDate(task.completedAt, locale, true)}` : `${t.tasks.dueAt} ${formatDate(task.dueAt, locale, true)}`}</span>
                    {task.assignedStaff && <span>· {task.assignedStaff.user.name}</span>}
                    {overdue && <Badge tone="bg-rose-100 text-rose-800">{t.tasks.overdue}</Badge>}
                  </div>
                  {task.notes && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">{task.notes}</p>}
                </div>
                <TaskActions locale={locale} taskId={task.id} status={task.status} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
