"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createReminderRule, deleteReminderRule, setReminderRuleActive } from "@/actions/reminder-rules";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { REMINDER_RULES_DICT } from "@/lib/admin-locale/reminder-rules";

interface RuleRow {
  id: string;
  name: string;
  keyword: string;
  intervalMonths: number | null;
  intervalKm: number | null;
  leadDays: number;
  isActive: boolean;
}

const field = "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

export function RuleManager({ rules }: { rules: RuleRow[] }) {
  const t = REMINDER_RULES_DICT[useAdminLocale()];
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [keyword, setKeyword] = useState("");
  const [months, setMonths] = useState("6");
  const [km, setKm] = useState("");
  const [lead, setLead] = useState("14");

  const fail = (code: string) => toast.error(t.errors[code] ?? code);
  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  function create(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createReminderRule({ name, keyword, intervalMonths: num(months), intervalKm: num(km), leadDays: num(lead) });
      if (res.error) {
        fail(res.error);
        return;
      }
      setName("");
      setKeyword("");
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="bg-white rounded-xl border border-slate-200 p-5 grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.form.name}</label>
          <input className={field} value={name} placeholder={t.form.namePh} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.form.keyword}</label>
          <input className={field} value={keyword} placeholder={t.form.keywordPh} onChange={(e) => setKeyword(e.target.value)} />
          <p className="text-xs text-slate-500 mt-1">{t.form.keywordHint}</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.form.months}</label>
          <input className={field} type="number" min={1} max={120} value={months} onChange={(e) => setMonths(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.form.km}</label>
          <input className={field} type="number" min={0} value={km} onChange={(e) => setKm(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.form.lead}</label>
          <input className={field} type="number" min={0} max={90} value={lead} onChange={(e) => setLead(e.target.value)} />
        </div>
        <div className="self-end">
          <button disabled={pending} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
            {t.form.create}
          </button>
        </div>
      </form>

      {rules.length === 0 ? (
        <p className="text-sm text-slate-500">{t.list.empty}</p>
      ) : (
        <ul className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {rules.map((r) => (
            <li key={r.id} className="px-5 py-3 flex items-start justify-between gap-3">
              <div className={r.isActive ? "" : "opacity-60"}>
                <p className="font-medium text-slate-900 text-sm">
                  {r.name} {!r.isActive && <span className="text-xs text-slate-500">({t.list.inactive})</span>}
                </p>
                <p className="text-xs text-slate-500">
                  {t.list.every(r.intervalMonths ?? 0, r.intervalKm)} · {t.list.keywordIs(r.keyword)} · {t.list.lead(r.leadDays)}
                </p>
              </div>
              <div className="flex gap-3 text-sm">
                <button
                  disabled={pending}
                  className="text-slate-600 disabled:opacity-50"
                  onClick={() =>
                    startTransition(async () => {
                      const res = await setReminderRuleActive(r.id, !r.isActive);
                      if (res.error) fail(res.error);
                    })
                  }
                >
                  {r.isActive ? t.list.pause : t.list.resume}
                </button>
                <button
                  disabled={pending}
                  className="text-red-600 disabled:opacity-50"
                  onClick={() => {
                    if (!confirm(t.list.confirmDelete)) return;
                    startTransition(async () => {
                      const res = await deleteReminderRule(r.id);
                      if (res.error) fail(res.error);
                    });
                  }}
                >
                  {t.list.delete}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
