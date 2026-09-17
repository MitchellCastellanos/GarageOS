"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createTeamMember,
  resetTeamMemberPassword,
  updateTeamMemberRole,
  deleteTeamMember,
} from "@/actions/users";
import { Loader2, UserPlus, KeyRound, Trash2 } from "lucide-react";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { SETTINGS_DICT } from "@/lib/admin-locale/settings";
import { UpgradeCTA } from "@/components/billing/UpgradeCTA";

type Role = "OWNER" | "MECHANIC" | "VIEWER";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: Date;
}

interface TeamManagementProps {
  members: TeamMember[];
  currentUserId: string;
  seatLimit: number | null;
}

export function TeamManagement({ members, currentUserId, seatLimit }: TeamManagementProps) {
  const locale = useAdminLocale();
  const t = SETTINGS_DICT[locale];
  const seatLimitReached = seatLimit != null && members.length >= seatLimit;
  const ROLE_LABELS: Record<Role, string> = {
    OWNER: t.team.roleOwner,
    MECHANIC: t.team.roleMechanic,
    VIEWER: t.team.roleViewer,
  };
  const [showCreate, setShowCreate] = useState(false);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createTeamMember(formData);
      if (result?.success) {
        toast.success(t.team.userCreated);
        setShowCreate(false);
        (e.target as HTMLFormElement).reset();
      } else if (result?.error) {
        const msg = Object.values(result.error).flat()[0];
        toast.error(typeof msg === "string" ? msg : t.team.userCreated);
      }
    });
  }

  function handleReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await resetTeamMemberPassword(formData);
      if (result?.success) {
        toast.success(t.team.passwordReset);
        setResetUserId(null);
        (e.target as HTMLFormElement).reset();
      } else {
        toast.error(result?.error ?? t.team.passwordReset);
      }
    });
  }

  function handleRoleChange(userId: string, role: Role) {
    const formData = new FormData();
    formData.set("userId", userId);
    formData.set("role", role);
    startTransition(async () => {
      const result = await updateTeamMemberRole(formData);
      if (result?.success) toast.success(t.team.roleUpdated);
      else toast.error(result?.error ?? t.team.roleUpdated);
    });
  }

  function handleDelete(userId: string, name: string) {
    if (!confirm(t.team.confirmDelete(name))) return;
    startTransition(async () => {
      const result = await deleteTeamMember(userId);
      if (result?.success) toast.success(t.team.userDeleted);
      else toast.error(result?.error ?? t.team.userDeleted);
    });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-slate-900">{t.team.title}</h2>
          <p className="text-sm text-slate-500 mt-1">{t.team.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          disabled={seatLimitReached}
          className="flex items-center gap-2 shrink-0 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          {t.team.newUser}
        </button>
      </div>

      {seatLimitReached && (
        <UpgradeCTA
          requiredPlan="PRO"
          title={t.billingCta.seatLimitTitle}
          description={t.billingCta.seatLimitDescription(seatLimit!)}
          compact
        />
      )}

      {showCreate && !seatLimitReached && (
        <form
          onSubmit={handleCreate}
          className="border border-blue-100 bg-blue-50/50 rounded-lg p-4 space-y-3"
        >
          <p className="text-sm font-medium text-slate-800">{t.team.newAccount}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input name="name" placeholder={t.team.fullName} required className={inputClass} />
            <input name="email" type="email" placeholder={t.team.email} required className={inputClass} />
            <input
              name="password"
              type="password"
              placeholder={t.team.tempPassword}
              required
              minLength={8}
              className={inputClass}
            />
            <select name="role" defaultValue="MECHANIC" className={inputClass}>
              <option value="MECHANIC">{t.team.roleMechanicOption}</option>
              <option value="VIEWER">{t.team.roleViewerOption}</option>
              <option value="OWNER">{t.team.roleOwnerOption}</option>
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900"
            >
              {t.team.cancel}
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              {pending && <Loader2 className="w-4 h-4 animate-spin" />}
              {t.team.createAccount}
            </button>
          </div>
        </form>
      )}

      <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
        {members.map((member) => (
          <div key={member.id} className="p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-slate-900">
                  {member.name}
                  {member.id === currentUserId && (
                    <span className="ml-2 text-xs font-normal text-blue-600">({t.team.you})</span>
                  )}
                </p>
                <p className="text-sm text-slate-500">{member.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {member.id === currentUserId ? (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                    {ROLE_LABELS[member.role]}
                  </span>
                ) : (
                  <select
                    value={member.role}
                    disabled={pending}
                    onChange={(e) => handleRoleChange(member.id, e.target.value as Role)}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
                  >
                    <option value="OWNER">{t.team.roleOwner}</option>
                    <option value="MECHANIC">{t.team.roleMechanic}</option>
                    <option value="VIEWER">{t.team.roleViewer}</option>
                  </select>
                )}
                {member.id !== currentUserId && (
                  <>
                    <button
                      type="button"
                      onClick={() => setResetUserId(resetUserId === member.id ? null : member.id)}
                      className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title={t.team.resetPassword}
                    >
                      <KeyRound className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(member.id, member.name)}
                      disabled={pending}
                      className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      title={t.team.deleteUser}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {resetUserId === member.id && (
              <form onSubmit={handleReset} className="flex flex-wrap items-end gap-2 pt-1">
                <input type="hidden" name="userId" value={member.id} />
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs text-slate-500 mb-1">
                    {t.team.newPasswordFor(member.name)}
                  </label>
                  <input
                    name="newPassword"
                    type="password"
                    required
                    minLength={8}
                    placeholder={t.team.minChars}
                    className={inputClass}
                  />
                </div>
                <button
                  type="submit"
                  disabled={pending}
                  className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg h-[38px]"
                >
                  {pending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t.team.savePassword}
                </button>
                <button
                  type="button"
                  onClick={() => setResetUserId(null)}
                  className="text-sm text-slate-500 hover:text-slate-800 px-2 py-2"
                >
                  {t.team.cancel}
                </button>
              </form>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-400">{t.team.legend}</p>
    </div>
  );
}

const inputClass =
  "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
