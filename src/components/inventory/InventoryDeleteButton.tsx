"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteInventoryPart } from "@/actions/inventory";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { INVENTORY_DICT } from "@/lib/admin-locale/inventory";

export function InventoryDeleteButton({ partId }: { partId: string }) {
  const locale = useAdminLocale();
  const t = INVENTORY_DICT[locale];
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(t.detail.deleteConfirm)) return;
    startTransition(() => deleteInventoryPart(partId));
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className="flex items-center gap-1.5 border border-red-200 hover:border-red-400 text-red-600 hover:text-red-700 text-sm font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
    >
      <Trash2 className="w-3.5 h-3.5" />
      {t.detail.deleteButton}
    </button>
  );
}
