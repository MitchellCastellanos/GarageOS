"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/Switch";
import { setClientMarketingConsent } from "@/actions/clients";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { CLIENTS_DICT } from "@/lib/admin-locale/clients";

interface MarketingConsentToggleProps {
  clientId: string;
  consent: boolean;
  hasEmail: boolean;
}

export function MarketingConsentToggle({ clientId, consent, hasEmail }: MarketingConsentToggleProps) {
  const locale = useAdminLocale();
  const t = CLIENTS_DICT[locale].marketingConsent;
  const [pending, startTransition] = useTransition();

  function handleChange(checked: boolean) {
    startTransition(async () => {
      await setClientMarketingConsent(clientId, checked);
      toast.success(checked ? t.toastIncluded : t.toastExcluded);
    });
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-slate-900">{t.label}</p>
        <p className="text-xs text-slate-500">{hasEmail ? t.hintWithEmail : t.hintNoEmail}</p>
      </div>
      <Switch defaultChecked={consent} disabled={pending || !hasEmail} onChange={handleChange} />
    </div>
  );
}
