"use client";

import Link from "next/link";
import { Mail } from "lucide-react";
import { ADMIN } from "@/lib/routes";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { EMAIL_SENDING_DICT } from "@/lib/admin-locale/email-sending";
import { EmailDomainCard } from "./EmailDomainCard";
import { SenderSettingsSection } from "./SenderSettingsSection";
import type { DomainInfo } from "./domain-shared";
import type { CommunicationSettingsData } from "@/actions/communications-settings";

interface EmailSetupSectionProps {
  email: DomainInfo | null;
  canCustomDomain: boolean;
  canCreateIdentity: boolean;
  managedAddress: string | null;
  communications: CommunicationSettingsData;
}

export function EmailSetupSection({
  email,
  canCustomDomain,
  canCreateIdentity,
  managedAddress,
  communications,
}: EmailSetupSectionProps) {
  const locale = useAdminLocale();
  const t = EMAIL_SENDING_DICT[locale].banner;
  const showAdvanced = canCustomDomain || canCreateIdentity || Boolean(email);

  if (!showAdvanced) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5 flex gap-3">
        <Mail className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
        <div>
          <h2 className="font-semibold text-slate-900">{t.title}</h2>
          <p className="text-sm text-slate-600 mt-1">
            {managedAddress ? t.bodyWithAddress(managedAddress) : t.bodyNoSlug}
          </p>
          <Link
            href={`${ADMIN.settings}?tab=general`}
            className="inline-block text-sm font-medium text-teal-700 hover:underline mt-2"
          >
            {t.linkText}
          </Link>
          <p className="text-xs text-slate-500 mt-3">
            {t.upgradeHint}{" "}
            <Link href={`${ADMIN.settings}?tab=billing`} className="font-medium text-teal-700 hover:underline">
              {t.upgradeLinkText}
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <EmailDomainCard email={email} entitled={canCustomDomain} />
      <SenderSettingsSection
        key={JSON.stringify(communications)}
        data={communications}
        canCreateIdentity={canCreateIdentity}
      />
    </>
  );
}
