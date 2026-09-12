"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/Switch";
import { setClientMarketingConsent } from "@/actions/clients";

interface MarketingConsentToggleProps {
  clientId: string;
  consent: boolean;
  hasEmail: boolean;
}

export function MarketingConsentToggle({ clientId, consent, hasEmail }: MarketingConsentToggleProps) {
  const [pending, startTransition] = useTransition();

  function handleChange(checked: boolean) {
    startTransition(async () => {
      await setClientMarketingConsent(clientId, checked);
      toast.success(checked ? "Cliente incluido en campañas" : "Cliente excluido de campañas");
    });
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-slate-900">Recibir campañas por email</p>
        <p className="text-xs text-slate-500">
          {hasEmail ? "Marca solo si el cliente dio su consentimiento." : "El cliente no tiene email registrado."}
        </p>
      </div>
      <Switch defaultChecked={consent} disabled={pending || !hasEmail} onChange={handleChange} />
    </div>
  );
}
