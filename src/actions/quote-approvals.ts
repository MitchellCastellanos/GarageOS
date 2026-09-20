"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  buildQuoteApprovalSnapshot,
  getQuoteForApproval,
  hashQuoteApprovalSnapshot,
} from "@/lib/quote-approval";
import { getQuoteApprovalStrings } from "@/lib/quote-approval-i18n";

export async function decideQuoteApproval(
  token: string,
  decision: "ACCEPTED" | "REJECTED",
  actorName: string,
) {
  const quote = await getQuoteForApproval(token);
  const t = getQuoteApprovalStrings(quote?.language).errors;

  const name = actorName.trim().slice(0, 120);
  if (!name) return { error: t.nameRequired };

  if (!quote || !["SENT", "DRAFT"].includes(quote.status)) {
    return { error: t.linkInvalid };
  }

  const snapshot = buildQuoteApprovalSnapshot(quote);
  const documentHash = hashQuoteApprovalSnapshot(snapshot);
  const now = new Date();

  try {
    await db.$transaction(async (tx) => {
      const consumed = await tx.quote.updateMany({
        where: {
          id: quote.id,
          approvalToken: token,
          approvalTokenConsumedAt: null,
          approvalTokenExpiresAt: { gt: now },
          status: { in: ["SENT", "DRAFT"] },
        },
        data: {
          status: decision,
          approvalTokenConsumedAt: now,
        },
      });
      if (consumed.count !== 1) throw new Error("APPROVAL_ALREADY_CONSUMED");
      await tx.quoteApproval.create({
        data: {
          quoteId: quote.id,
          decision,
          documentHash,
          documentSnapshot: snapshot,
          actorName: name,
          channel: "SMS_LINK",
        },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "APPROVAL_ALREADY_CONSUMED") {
      return { error: t.alreadyUsed };
    }
    console.error("Error registrando aprobación de cotización:", error);
    return { error: t.genericFailure };
  }

  revalidatePath(`/quote/${token}`);
  revalidatePath(`/quotes/${quote.id}`);
  revalidatePath("/quotes");
  return { success: true, decision };
}
