"use client";

import { useRouter } from "next/navigation";
import { createProspect, updateProspect } from "@/actions/sales-prospects";
import { PLATFORM } from "@/lib/routes";
import { btnPrimary, btnSecondary, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage, useCrmAction } from "@/components/sales-crm/useCrmAction";

export interface ProspectFormValues {
  name?: string; website?: string | null; address?: string | null; city?: string | null; province?: string | null; postalCode?: string | null; phone?: string | null; email?: string | null;
  industry?: string | null; shopSize?: string | null; locationCount?: number; currentSoftware?: string | null; source?: string; sourceDetail?: string | null;
  preferredLanguage?: string; tags?: string[]; notes?: string | null; assignedStaffId?: string | null;
}

export function ProspectForm({ locale, prospectId, values = {}, staff, canAssign }: {
  locale: "en" | "fr"; prospectId?: string; values?: ProspectFormValues; staff: { id: string; name: string }[]; canAssign: boolean;
}) {
  const { t, pending, error, run } = useCrmAction(locale);
  const router = useRouter();
  const f = t.prospects.form;
  const editing = !!prospectId;
  return (
    <form
      className="grid gap-5 sm:grid-cols-2"
      action={(form) => run(
        () => (editing ? updateProspect(prospectId!, form) : createProspect(form)),
        (r) => router.push(PLATFORM.salesProspect("prospectId" in r ? String(r.prospectId) : prospectId!)),
      )}
    >
      <fieldset className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-slate-900">{f.business}</legend>
        <label className={`${labelCls} sm:col-span-2`}>{f.businessName} *
          <input className={inputCls} name="name" required maxLength={120} defaultValue={values.name ?? ""} autoComplete="off" disabled={pending} />
        </label>
        <label className={labelCls}>{f.website}<input className={inputCls} name="website" inputMode="url" maxLength={300} defaultValue={values.website ?? ""} disabled={pending} /></label>
        <label className={labelCls}>{f.generalEmail}<input className={inputCls} name="email" type="email" maxLength={254} defaultValue={values.email ?? ""} disabled={pending} /></label>
        <label className={labelCls}>{f.generalPhone}<input className={inputCls} name="phone" type="tel" maxLength={30} defaultValue={values.phone ?? ""} disabled={pending} /></label>
        <label className={labelCls}>{f.address}<input className={inputCls} name="address" maxLength={200} defaultValue={values.address ?? ""} disabled={pending} /></label>
        <label className={labelCls}>{t.common.city}<input className={inputCls} name="city" maxLength={80} defaultValue={values.city ?? ""} disabled={pending} /></label>
        <div className="grid grid-cols-2 gap-4">
          <label className={labelCls}>{f.province}<input className={inputCls} name="province" maxLength={60} defaultValue={values.province ?? ""} disabled={pending} /></label>
          <label className={labelCls}>{f.postalCode}<input className={inputCls} name="postalCode" maxLength={12} defaultValue={values.postalCode ?? ""} disabled={pending} /></label>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-slate-900">{f.profile}</legend>
        <label className={labelCls}>{f.language}
          <select className={inputCls} name="preferredLanguage" defaultValue={values.preferredLanguage ?? "UNKNOWN"} disabled={pending}>
            {["UNKNOWN", "FR", "EN"].map((l) => <option key={l} value={l}>{t.languages[l]}</option>)}
          </select>
          <span className="text-xs font-normal text-slate-500">{f.languageHint}</span>
        </label>
        <label className={labelCls}>{f.industry}
          <select className={inputCls} name="industry" defaultValue={values.industry ?? ""} disabled={pending}>
            <option value="">{t.common.none}</option>{Object.entries(t.industries).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className={labelCls}>{f.shopSize}
          <select className={inputCls} name="shopSize" defaultValue={values.shopSize ?? ""} disabled={pending}>
            <option value="">{t.common.none}</option>{Object.entries(t.shopSizes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className={labelCls}>{f.locations}<input className={inputCls} name="locationCount" type="number" min={1} max={1000} defaultValue={values.locationCount ?? 1} disabled={pending} /></label>
        <label className={labelCls}>{f.software}<input className={inputCls} name="currentSoftware" maxLength={100} placeholder={f.softwareHint} defaultValue={values.currentSoftware ?? ""} disabled={pending} /></label>
        <label className={labelCls}>{t.common.source}
          <select className={inputCls} name="source" defaultValue={values.source ?? "OTHER"} disabled={pending}>
            {Object.entries(t.sources).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className={labelCls}>{f.sourceDetail}<input className={inputCls} name="sourceDetail" maxLength={120} defaultValue={values.sourceDetail ?? ""} disabled={pending} /></label>
        <label className={labelCls}>{f.tags}<input className={inputCls} name="tags" defaultValue={(values.tags ?? []).join(", ")} disabled={pending} /></label>
        {!editing && canAssign && (
          <label className={labelCls}>{f.assignTo}
            <select className={inputCls} name="assignedStaffId" defaultValue={values.assignedStaffId ?? ""} disabled={pending}>
              <option value="">{t.common.unassigned}</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
        <label className={`${labelCls} sm:col-span-2`}>{f.internalNotes}
          <textarea className={`${inputCls} min-h-28 py-2`} name="notes" maxLength={5000} defaultValue={values.notes ?? ""} disabled={pending} />
        </label>
      </fieldset>

      {!editing && (
        <label className="flex items-start gap-2 text-sm text-slate-700 sm:col-span-2">
          <input type="checkbox" name="allowDuplicate" className="mt-1 h-4 w-4" disabled={pending} /> {f.createAnyway}
        </label>
      )}
      <div className="sm:col-span-2"><FormMessage error={error} /></div>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button className={btnPrimary} disabled={pending}>{pending ? t.common.saving : editing ? t.common.save : t.common.create}</button>
        <button type="button" className={btnSecondary} onClick={() => router.back()} disabled={pending}>{t.common.cancel}</button>
      </div>
    </form>
  );
}
