"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { StatusBadge, DnsRecordsTable, type DomainInfo } from "./domain-shared";
import { setEmailDomain, verifyEmailDomainAction, removeEmailDomainAction } from "@/actions/domains";
import { UpgradeCTA } from "@/components/billing/UpgradeCTA";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { SETTINGS_DICT } from "@/lib/admin-locale/settings";

export function EmailDomainCard({ email, entitled }: { email: DomainInfo | null; entitled: boolean }) {
  const locale = useAdminLocale();
  const t = SETTINGS_DICT[locale].domain.email;
  const tShared = SETTINGS_DICT[locale].domain.shared;
  const [pending, startTransition] = useTransition();
  const [domain, setDomain] = useState(email?.domain ?? "");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await setEmailDomain(formData);
      if (result?.success) toast.success(t.savedToast);
      else toast.error(result?.error ?? t.saveErrorToast);
    });
  }

  function handleVerify() {
    startTransition(async () => {
      const result = await verifyEmailDomainAction();
      if (result?.success) {
        if (result.status === "VERIFIED") toast.success(t.verifiedToast);
        else toast.error(t.notVerifiedToast);
      } else toast.error(result?.error ?? t.verifyErrorToast);
    });
  }

  function handleRemove() {
    startTransition(async () => {
      const result = await removeEmailDomainAction();
      if (result?.success) {
        toast.success(t.removedToast);
        setDomain("");
      } else toast.error(t.removeErrorToast);
    });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-slate-900">{t.title}</h2>
        <p className="text-sm text-slate-500 mt-1">{t.description}</p>
      </div>

      {!entitled && !email && (
        <UpgradeCTA
          requiredPlan="PRO"
          title={t.upgradeTitle}
          description={t.upgradeDescription}
          compact
        />
      )}

      {(entitled || email) && (
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
          <input
            name="domain"
            placeholder={t.domainPlaceholder}
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            disabled={!entitled}
            className="flex-1 min-w-[200px] px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50 disabled:text-slate-400"
          />
          <button
            type="submit"
            disabled={pending || !domain.trim() || !entitled}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            {pending && <Loader2 className="w-4 h-4 animate-spin" />}
            {email ? t.updateButton : t.registerButton}
          </button>
        </form>
      )}
      {!entitled && email && (
        <p className="text-xs text-amber-600">{t.downgradedHint}</p>
      )}

      {email && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">{email.domain}</span>
            <StatusBadge status={email.status} />
          </div>

          {email.status !== "VERIFIED" && (
            <>
              <p className="text-xs text-slate-500">{t.dnsInstructionsHint}</p>
              <DnsRecordsTable records={email.dnsRecords} />
            </>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleVerify}
              disabled={pending}
              className="flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:bg-teal-50 px-3 py-1.5 rounded-lg"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {tShared.verifyButton}
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={pending}
              className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {tShared.removeButton}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

