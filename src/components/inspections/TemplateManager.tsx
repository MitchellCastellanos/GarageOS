"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createInspectionTemplate, deleteInspectionTemplate } from "@/actions/inspection-templates";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { INSPECTIONS_ADVANCED_DICT } from "@/lib/admin-locale/inspections-advanced";

interface TemplateRow {
  id: string;
  name: string;
  items: string[];
}

const field = "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

export function TemplateManager({ templates }: { templates: TemplateRow[] }) {
  const t = INSPECTIONS_ADVANCED_DICT[useAdminLocale()].templates;
  const [name, setName] = useState("");
  const [items, setItems] = useState("");
  const [pending, startTransition] = useTransition();

  function create(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createInspectionTemplate({ name, items: items.split("\n").map((i) => i.trim()).filter(Boolean) });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setName("");
      setItems("");
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.name}</label>
          <input className={field} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.itemsLabel}</label>
          <textarea className={field} rows={8} value={items} onChange={(e) => setItems(e.target.value)} />
          <p className="text-xs text-slate-500 mt-1">{t.itemsHint}</p>
        </div>
        <button disabled={pending || !name.trim() || !items.trim()} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
          {t.create}
        </button>
      </form>

      {templates.length === 0 ? (
        <p className="text-sm text-slate-500">{t.empty}</p>
      ) : (
        <ul className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {templates.map((tpl) => (
            <li key={tpl.id} className="px-5 py-3 flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-slate-900 text-sm">{tpl.name}</p>
                <p className="text-xs text-slate-500">{t.itemsCount(tpl.items.length)} · {tpl.items.slice(0, 6).join(", ")}{tpl.items.length > 6 ? "…" : ""}</p>
              </div>
              <button
                className="text-sm text-red-600 disabled:opacity-50"
                disabled={pending}
                onClick={() => {
                  if (!confirm(t.confirmDelete)) return;
                  startTransition(async () => {
                    const res = await deleteInspectionTemplate(tpl.id);
                    if (res.error) toast.error(res.error);
                  });
                }}
              >
                {t.delete}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
