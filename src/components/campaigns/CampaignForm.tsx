"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Users } from "lucide-react";
import { createCampaignAction, previewAudienceAction } from "@/actions/campaigns";
import { adminPath } from "@/lib/routes";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { CAMPAIGNS_DICT } from "@/lib/admin-locale/campaigns";

type SegmentType = "ALL_CONSENTED" | "LANGUAGE" | "INACTIVE_MONTHS" | "MANUAL";

export function CampaignForm() {
  const locale = useAdminLocale();
  const t = CAMPAIGNS_DICT[locale];
  const router = useRouter();
  const [segmentType, setSegmentType] = useState<SegmentType>("ALL_CONSENTED");
  const [pending, startTransition] = useTransition();
  const [previewing, startPreviewTransition] = useTransition();
  const [preview, setPreview] = useState<{ count: number; sample: { id: string; name: string; email: string | null }[] } | null>(null);

  function handlePreview(formData: FormData) {
    startPreviewTransition(async () => {
      const result = await previewAudienceAction(formData);
      setPreview(result);
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createCampaignAction(formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(t.form.toastSavedAsDraft);
      if (result?.campaignId) router.push(adminPath(`/campaigns/${result.campaignId}`));
    });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.form.nameLabel}</label>
        <input
          name="name"
          required
          placeholder={t.form.namePlaceholder}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.form.subjectLabel}</label>
        <input
          name="subject"
          required
          placeholder={t.form.subjectPlaceholder}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.form.messageLabel}</label>
        <textarea
          name="body"
          required
          rows={8}
          placeholder={t.form.messagePlaceholder}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
        />
        <p className="text-xs text-slate-400 mt-1">{t.form.messageHint}</p>
      </div>

      <div className="border-t border-slate-100 pt-4">
        <label className="block text-sm font-medium text-slate-700 mb-2">{t.form.audienceLabel}</label>
        <select
          name="segmentType"
          value={segmentType}
          onChange={(e) => {
            setSegmentType(e.target.value as SegmentType);
            setPreview(null);
          }}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-2"
        >
          <option value="ALL_CONSENTED">{t.form.segmentOptions.ALL_CONSENTED}</option>
          <option value="LANGUAGE">{t.form.segmentOptions.LANGUAGE}</option>
          <option value="INACTIVE_MONTHS">{t.form.segmentOptions.INACTIVE_MONTHS}</option>
          <option value="MANUAL">{t.form.segmentOptions.MANUAL}</option>
        </select>

        {segmentType === "LANGUAGE" && (
          <select name="language" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-2">
            <option value="EN">{t.form.languageOptions.EN}</option>
            <option value="FR">{t.form.languageOptions.FR}</option>
          </select>
        )}
        {segmentType === "INACTIVE_MONTHS" && (
          <input
            name="months"
            type="number"
            min={1}
            defaultValue={6}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-2"
          />
        )}
        {segmentType === "MANUAL" && (
          <input
            name="clientIds"
            placeholder={t.form.manualPlaceholder}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-2"
          />
        )}

        <button
          type="button"
          disabled={previewing}
          onClick={(e) => handlePreview(new FormData(e.currentTarget.closest("form")!))}
          className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
        >
          {previewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
          {t.form.viewAudienceButton}
        </button>

        {preview && (
          <p className="text-sm text-slate-600 mt-2">
            {t.form.recipientCountLabel(preview.count)}
            {preview.sample.length > 0 && (
              <span className="text-slate-400">
                {t.form.sampleSuffix(preview.sample.map((c) => c.name || c.email).join(", "))}
              </span>
            )}
          </p>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg"
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          {t.form.saveDraftButton}
        </button>
      </div>
    </form>
  );
}
