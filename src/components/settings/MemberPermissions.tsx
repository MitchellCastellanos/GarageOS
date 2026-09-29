"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setTeamMemberPermissions } from "@/actions/users";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { PERMISSIONS_DICT } from "@/lib/admin-locale/permissions";
import { DELEGABLE_PERMISSIONS, defaultPermissions, resolvePermissions, type Permission, type Role } from "@/domain/permissions";

interface Props {
  userId: string;
  role: Exclude<Role, "OWNER">;
  grants: string[];
  denies: string[];
  advanced: boolean;
}

export function MemberPermissions({ userId, role, grants, denies, advanced }: Props) {
  const t = PERMISSIONS_DICT[useAdminLocale()];
  const defaults = defaultPermissions(role);
  const [selected, setSelected] = useState<Set<Permission>>(() => new Set(resolvePermissions(role, { grants, denies }, true)));
  const [pending, startTransition] = useTransition();

  if (!advanced) {
    return <p className="text-xs text-slate-500">{t.locked}</p>;
  }

  function save() {
    // Guardamos solo las diferencias contra el rol.
    const g = DELEGABLE_PERMISSIONS.filter((p) => selected.has(p) && !defaults.has(p));
    const d = DELEGABLE_PERMISSIONS.filter((p) => !selected.has(p) && defaults.has(p));
    startTransition(async () => {
      const res = await setTeamMemberPermissions(userId, { grants: g, denies: d });
      if (res.error) toast.error(res.error);
      else toast.success(t.saved);
    });
  }

  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-slate-600 font-medium">{t.title}</summary>
      <div className="mt-2 space-y-1.5">
        <p className="text-xs text-slate-500">{t.hint}</p>
        {DELEGABLE_PERMISSIONS.map((p) => (
          <label key={p} className="flex items-start gap-2 text-slate-700">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-slate-300"
              checked={selected.has(p)}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(p);
                else next.delete(p);
                setSelected(next);
              }}
            />
            <span>
              {t.labels[p] ?? p}
              {defaults.has(p) && <span className="ml-1 text-xs text-slate-400">({t.roleDefault})</span>}
            </span>
          </label>
        ))}
        <button type="button" disabled={pending} onClick={save} className="mt-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
          {t.save}
        </button>
      </div>
    </details>
  );
}
