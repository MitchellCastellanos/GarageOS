"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  buildQuoteApprovalSnapshot,
  getQuoteForApproval,
  hashQuoteApprovalSnapshot,
} from "@/lib/quote-approval";

export async function decideQuoteApproval(
  token: string,
  decision: "ACCEPTED" | "REJECTED",
  actorName: string,
) {
  const name = actorName.trim().slice(0, 120);
  if (!name) return { error: "Escribe tu nombre para registrar la decisión." };

  const quote = await getQuoteForApproval(token);
  if (!quote || !["SENT", "DRAFT"].includes(quote.status)) {
    return { error: "Este enlace ya no es válido o la cotización ya no está disponible." };
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
      return { error: "Este enlace ya fue utilizado." };
    }
    console.error("Error registrando aprobación de cotización:", error);
    return { error: "No pudimos registrar tu decisión. Intenta de nuevo." };
  }

  revalidatePath(`/quote/${token}`);
  revalidatePath(`/quotes/${quote.id}`);
  revalidatePath("/quotes");
  return { success: true, decision };
}
