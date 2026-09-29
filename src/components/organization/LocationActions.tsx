"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { createShopLocation, switchActiveShop } from "@/actions/locations";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { ORGANIZATION_DICT } from "@/lib/admin-locale/organization";

export function SwitchLocationButton({ shopId }: { shopId: string }) {
  const t = ORGANIZATION_DICT[useAdminLocale()];
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await switchActiveShop(shopId);
          if (res && "error" in res && res.error) toast.error(res.error);
          else router.refresh();
        })
      }
      className="text-sm font-medium text-blue-600 hover:underline disabled:opacity-50"
    >
      {pending ? t.switching : t.switchTo}
    </button>
  );
}

export function AddLocationForm({ label }: { label: string }) {
  const t = ORGANIZATION_DICT[useAdminLocale()];
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    start(async () => {
      const res = await createShopLocation({ name: name.trim() });
      if (res && "success" in res && res.success) {
        setName("");
        router.refresh();
        return;
      }
      const err = res && "error" in res ? res.error : null;
      const msg = typeof err === "string" ? err : err ? Object.values(err).flat()[0] : null;
      toast.error(typeof msg === "string" ? msg : t.errorGeneric);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t.namePlaceholder}
        aria-label={t.namePlaceholder}
        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
      >
        <Plus className="w-4 h-4" />
        {pending ? t.adding : label}
      </button>
    </form>
  );
}
