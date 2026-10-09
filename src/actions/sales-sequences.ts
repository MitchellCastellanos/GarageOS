"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PLATFORM } from "@/lib/routes";
import { requireCrmActor } from "@/lib/sales-crm/access";
import { crmAction } from "@/lib/sales-crm/result";
import { CrmError } from "@/lib/sales-crm/prospects";
import { createDefaultSequence, createSequence, enroll, pauseEnrollment, resumeEnrollment, setSequenceStatus, stopEnrollment, updateSequence } from "@/lib/sales-comms/sequences";

const refresh = () => { revalidatePath(PLATFORM.salesOutreach); };

const seqSchema = z.object({
  name: z.string().trim().min(2).max(120), description: z.string().max(500).optional(),
  businessDaysOnly: z.string().optional().transform((v) => v === "on" || v === "true"),
  steps: z.string().transform((v, ctx) => { try { return z.array(z.object({ dayOffset: z.coerce.number().int(), templateKey: z.string() })).parse(JSON.parse(v)); } catch { ctx.addIssue({ code: "custom", message: "INVALID_STEPS" }); return z.NEVER; } }),
});

/** Super Admin only (manage_sequences): sequences are authored centrally, sellers can only enroll into ACTIVE ones. */
export async function saveSequence(form: FormData) {
  const actor = await requireCrmActor("manage_sequences");
  return crmAction(async () => {
    const v = seqSchema.parse(Object.fromEntries(form));
    const id = String(form.get("id") ?? "");
    if (id) { await updateSequence(actor, id, v); refresh(); return { id }; }
    const s = await createSequence(actor, v);
    refresh();
    return { id: s.id };
  });
}

export async function createDefaultSequenceAction() {
  const actor = await requireCrmActor("manage_sequences");
  return crmAction(async () => { const s = await createDefaultSequence(actor); refresh(); return { id: s.id }; });
}

export async function changeSequenceStatus(id: string, status: "ACTIVE" | "PAUSED" | "ARCHIVED") {
  const actor = await requireCrmActor("manage_sequences");
  return crmAction(async () => {
    if (!["ACTIVE", "PAUSED", "ARCHIVED"].includes(status)) throw new CrmError("INVALID");
    await setSequenceStatus(actor, id, status);
    refresh();
    return {};
  });
}

export async function enrollProspect(form: FormData) {
  const actor = await requireCrmActor("enroll_sequences");
  return crmAction(async () => {
    const e = await enroll(actor, {
      sequenceId: String(form.get("sequenceId") ?? ""), prospectId: String(form.get("prospectId") ?? ""), contactId: String(form.get("contactId") ?? ""),
      languageOverride: form.get("languageOverride") === "FR" ? "FR" : form.get("languageOverride") === "EN" ? "EN" : null,
    });
    refresh();
    revalidatePath(PLATFORM.salesProspect(e.prospectId));
    return { enrollmentId: e.id };
  });
}

export async function pauseEnrollmentAction(id: string) {
  const actor = await requireCrmActor("enroll_sequences");
  return crmAction(async () => { await pauseEnrollment(actor, id); refresh(); return {}; });
}
export async function resumeEnrollmentAction(id: string) {
  const actor = await requireCrmActor("enroll_sequences");
  return crmAction(async () => { await resumeEnrollment(actor, id); refresh(); return {}; });
}
export async function stopEnrollmentAction(id: string) {
  const actor = await requireCrmActor("enroll_sequences");
  return crmAction(async () => { await stopEnrollment(actor, id); refresh(); return {}; });
}
