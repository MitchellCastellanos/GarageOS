"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import type { InspectionCondition } from "@prisma/client";
import { Camera, Loader2, Trash2, Plus, X } from "lucide-react";
import {
  updateInspectionItem,
  deleteInspectionItem,
  addInspectionItem,
  uploadInspectionPhoto,
  deleteInspectionPhoto,
} from "@/actions/inspections";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { INSPECTIONS_DICT } from "@/lib/admin-locale/inspections";

interface Photo {
  id: string;
  url: string;
}

interface InspectionItemData {
  id: string;
  category: string;
  condition: InspectionCondition;
  notes: string | null;
  photos: Photo[];
}

const CONDITION_ORDER: InspectionCondition[] = ["GOOD", "ATTENTION", "SERVICE_REQUIRED"];

const CONDITION_STYLE: Record<InspectionCondition, { active: string; inactive: string }> = {
  GOOD: { active: "bg-emerald-600 text-white", inactive: "text-emerald-700 hover:bg-emerald-50" },
  ATTENTION: { active: "bg-amber-500 text-white", inactive: "text-amber-700 hover:bg-amber-50" },
  SERVICE_REQUIRED: { active: "bg-red-600 text-white", inactive: "text-red-700 hover:bg-red-50" },
};

function ItemRow({ item }: { item: InspectionItemData }) {
  const router = useRouter();
  const locale = useAdminLocale();
  const t = INSPECTIONS_DICT[locale];
  const [notes, setNotes] = useState(item.notes ?? "");
  const [isPending, startTransition] = useTransition();
  const [isUploading, startUpload] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleConditionChange(condition: InspectionCondition) {
    startTransition(async () => {
      const result = await updateInspectionItem(item.id, { condition, notes });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleNotesBlur() {
    if (notes === (item.notes ?? "")) return;
    startTransition(async () => {
      await updateInspectionItem(item.id, { condition: item.condition, notes });
      router.refresh();
    });
  }

  function handleDeleteItem() {
    if (!confirm(t.actions.confirmDeleteItem)) return;
    startTransition(async () => {
      const result = await deleteInspectionItem(item.id);
      if (result?.error) toast.error(result.error);
      router.refresh();
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    startUpload(async () => {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        const result = await uploadInspectionPhoto(item.id, formData);
        if (result?.error) toast.error(result.error);
      }
      router.refresh();
    });
    e.target.value = "";
  }

  function handleDeletePhoto(photoId: string) {
    if (!confirm(t.actions.confirmDeletePhoto)) return;
    startTransition(async () => {
      const result = await deleteInspectionPhoto(photoId);
      if (result?.error) toast.error(result.error);
      router.refresh();
    });
  }

  return (
    <div className="px-5 py-4 border-b border-slate-100 last:border-b-0">
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="font-medium text-slate-900 text-sm">{t.categoryLabel(item.category)}</p>
        <button
          type="button"
          onClick={handleDeleteItem}
          disabled={isPending}
          className="text-slate-300 hover:text-red-500 disabled:opacity-50 transition-colors"
          title={t.detail.deleteItemTitle}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex gap-1.5 mb-3">
        {CONDITION_ORDER.map((condition) => {
          const active = item.condition === condition;
          const style = CONDITION_STYLE[condition];
          return (
            <button
              key={condition}
              type="button"
              disabled={isPending}
              onClick={() => handleConditionChange(condition)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors disabled:opacity-50 ${
                active ? style.active : `bg-slate-50 ${style.inactive}`
              }`}
            >
              {t.conditionLabel(condition)}
            </button>
          );
        })}
        {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 self-center" />}
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={handleNotesBlur}
        rows={2}
        placeholder={t.detail.notesPlaceholder}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-3"
      />

      <div className="flex flex-wrap items-center gap-2">
        {item.photos.map((photo) => (
          <div key={photo.id} className="relative group w-16 h-16 rounded-lg border border-slate-200 overflow-hidden">
            <Image src={photo.url} alt="" fill unoptimized className="object-cover" sizes="64px" />
            <button
              type="button"
              onClick={() => handleDeletePhoto(photo.id)}
              title={t.detail.deletePhotoTitle}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-red-500 shadow-sm"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
          className="w-16 h-16 rounded-lg border border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-300 disabled:opacity-50 transition-colors"
          title={t.detail.uploadPhoto}
        >
          {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-5 h-5" />}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}

export function InspectionChecklist({
  inspectionId,
  items,
}: {
  inspectionId: string;
  items: InspectionItemData[];
}) {
  const router = useRouter();
  const locale = useAdminLocale();
  const t = INSPECTIONS_DICT[locale];
  const [newCategory, setNewCategory] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    const category = newCategory.trim();
    if (!category) return;
    startTransition(async () => {
      const result = await addInspectionItem(inspectionId, category);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setNewCategory("");
      router.refresh();
    });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-900">{t.detail.checklistTitle}</h2>
      </div>
      <div>
        {items.map((item) => (
          <ItemRow key={item.id} item={item} />
        ))}
      </div>
      <form onSubmit={handleAddItem} className="px-5 py-4 flex items-center gap-2 bg-slate-50">
        <input
          type="text"
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          placeholder={t.detail.addCustomItemPlaceholder}
          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          type="submit"
          disabled={isPending || !newCategory.trim()}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t.detail.addCustomItem}
        </button>
      </form>
    </div>
  );
}
