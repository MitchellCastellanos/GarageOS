"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MapPin, Plus, X } from "lucide-react";
import {
  createShopLocation,
  switchActiveShop,
  grantLocationAccess,
  revokeLocationAccess,
  type LocationUser,
} from "@/actions/locations";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { SETTINGS_DICT } from "@/lib/admin-locale/settings";

interface LocationShop {
  id: string;
  name: string;
  users: LocationUser[];
}

interface OrgUser {
  id: string;
  name: string;
  email: string;
  shopId: string | null;
}

interface LocationsSettingsProps {
  organizationId: string | null;
  shops: LocationShop[];
  currentShopId: string;
  orgUsers: OrgUser[];
}

export function LocationsSettings({
  organizationId,
  shops,
  currentShopId,
  orgUsers,
}: LocationsSettingsProps) {
  const locale = useAdminLocale();
  const t = SETTINGS_DICT[locale];
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    startTransition(async () => {
      const result = await createShopLocation({ name: name.trim() });
      if (result?.success) {
        toast.success(t.locations.createButton);
        setName("");
        router.refresh();
      } else {
        const msg = result?.error
          ? typeof result.error === "string"
            ? result.error
            : Object.values(result.error).flat()[0]
          : t.locations.errors.genericError;
        toast.error(typeof msg === "string" ? msg : t.locations.errors.genericError);
      }
    });
  }

  function handleSwitch(shopId: string) {
    startTransition(async () => {
      const result = await switchActiveShop(shopId);
      if (result?.success) {
        router.refresh();
      } else {
        toast.error(result?.error ?? t.locations.errors.genericError);
      }
    });
  }

  function handleGrant(shopId: string, userId: string) {
    if (!userId) return;
    startTransition(async () => {
      const result = await grantLocationAccess(userId, shopId);
      if (result?.success) {
        router.refresh();
      } else {
        toast.error(result?.error ?? t.locations.errors.genericError);
      }
    });
  }

  function handleRevoke(shopId: string, userId: string) {
    startTransition(async () => {
      const result = await revokeLocationAccess(userId, shopId);
      if (result?.success) {
        router.refresh();
      } else {
        toast.error(result?.error ?? t.locations.errors.genericError);
      }
    });
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="font-semibold text-slate-900">{t.locations.title}</h2>
        <p className="text-sm text-slate-500 mt-0.5">{t.locations.subtitle}</p>
      </div>

      {!organizationId && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-medium text-slate-900">{t.locations.addFirstTitle}</h3>
          <p className="text-sm text-slate-500 mt-1 mb-4">{t.locations.addFirstSubtitle}</p>
          <form onSubmit={handleCreate} className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.locations.namePlaceholder}
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={pending}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              {pending ? t.locations.creating : t.locations.createButton}
            </button>
          </form>
        </div>
      )}

      {organizationId && (
        <>
          <div className="space-y-4">
            {shops.map((shop) => {
              const isCurrent = shop.id === currentShopId;
              const availableUsers = orgUsers.filter(
                (u) => !shop.users.some((granted) => granted.id === u.id)
              );
              return (
                <div key={shop.id} className="bg-white rounded-xl border border-slate-200 p-5">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-slate-400" />
                      <h3 className="font-medium text-slate-900">{shop.name}</h3>
                      {isCurrent && (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                          {t.locations.currentBadge}
                        </span>
                      )}
                    </div>
                    {!isCurrent && (
                      <button
                        type="button"
                        onClick={() => handleSwitch(shop.id)}
                        disabled={pending}
                        className="text-sm text-blue-600 hover:underline disabled:opacity-50 flex-shrink-0"
                      >
                        {pending ? t.locations.switching : t.locations.switchButton}
                      </button>
                    )}
                  </div>

                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                    {t.locations.accessHeading}
                  </p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {shop.users.map((user) => (
                      <span
                        key={user.id}
                        className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 text-xs font-medium px-2.5 py-1 rounded-full"
                      >
                        {user.name}
                        {!user.viaHome && (
                          <button
                            type="button"
                            onClick={() => handleRevoke(shop.id, user.id)}
                            className="hover:text-red-600"
                            title={t.locations.revokeButton}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>

                  {availableUsers.length > 0 ? (
                    <div className="flex gap-2">
                      <select
                        className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        defaultValue=""
                        onChange={(e) => {
                          handleGrant(shop.id, e.target.value);
                          e.target.value = "";
                        }}
                      >
                        <option value="" disabled>
                          {t.locations.addAccessLabel}
                        </option>
                        {availableUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.email})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">{t.locations.noOtherUsers}</p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-medium text-slate-900 mb-3">{t.locations.createButton}</h3>
            <form onSubmit={handleCreate} className="flex gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.locations.namePlaceholder}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={pending}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                {pending ? t.locations.creating : t.locations.createButton}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
