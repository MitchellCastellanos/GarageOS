"use client";

import Image from "next/image";
import { useSiteLocale } from "@/components/booking/LocaleProvider";
import { LanguageSwitcher } from "@/components/booking/LanguageSwitcher";
import { ClientAppointmentActions } from "@/components/booking/ClientAppointmentActions";
import { NotifyChannelPreference } from "@/components/booking/NotifyChannelPreference";

interface ManageAppointmentViewProps {
  slug: string;
  token: string;
  shop: { name: string; logoUrl: string | null; phone: string | null };
  manageable: boolean;
  canConfirm: boolean;
  canCancel: boolean;
  clientName: string;
  title: string;
  startsAtFormatted: string;
  status: string;
  vehicleLabel: string | null;
  mechanicName: string | null;
  clientHasEmail: boolean;
  notifyChannel: "AUTO" | "SMS" | "EMAIL" | "BOTH";
}

export function ManageAppointmentView({
  slug,
  token,
  shop,
  manageable,
  canConfirm,
  canCancel,
  clientName,
  title,
  startsAtFormatted,
  status,
  vehicleLabel,
  mechanicName,
  clientHasEmail,
  notifyChannel,
}: ManageAppointmentViewProps) {
  const { t } = useSiteLocale();
  const statusLabel = t.manage.statuses[status as keyof typeof t.manage.statuses] ?? status;

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-xl mx-auto px-4 py-10">
        <div className="flex justify-end mb-4">
          <LanguageSwitcher variant="light" />
        </div>

        <header className="text-center mb-8">
          {shop.logoUrl && (
            <div className="flex justify-center mb-4">
              <Image
                src={shop.logoUrl}
                alt={shop.name}
                width={80}
                height={80}
                className="object-contain"
                unoptimized
              />
            </div>
          )}
          <h1 className="text-2xl font-bold text-slate-900">{shop.name}</h1>
          <p className="text-slate-500 mt-1">
            {manageable ? t.manage.headerSubtitleManageable : t.manage.headerSubtitleReadonly}
          </p>
        </header>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
          {manageable ? (
            <ClientAppointmentActions
              slug={slug}
              token={token}
              shop={{ phone: shop.phone }}
              clientName={clientName}
              title={title}
              startsAtFormatted={startsAtFormatted}
              status={status}
              vehicleLabel={vehicleLabel}
              mechanicName={mechanicName}
              canConfirm={canConfirm}
              canCancel={canCancel}
            />
          ) : null}
          <NotifyChannelPreference slug={slug} token={token} hasEmail={clientHasEmail} initialChannel={notifyChannel} />
          {!manageable && (
            <div className="space-y-4 text-center py-6">
              <p className="text-slate-700">{t.manage.helloLocked(clientName)}</p>
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm text-left space-y-1">
                <p className="font-medium text-slate-900">{title}</p>
                <p className="text-slate-600">{startsAtFormatted}</p>
                <p className="text-slate-500">
                  {t.manage.statusPrefix}
                  {statusLabel}
                </p>
              </div>
              {shop.phone && (
                <p className="text-sm text-slate-500">
                  {t.manage.callForQueries}{" "}
                  <a href={`tel:${shop.phone}`} className="text-teal-700 font-medium">
                    {shop.phone}
                  </a>
                  .
                </p>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">{shop.name}</p>
      </div>
    </div>
  );
}
