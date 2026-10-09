import { ZodError } from "zod";
import { CrmError } from "@/lib/sales-crm/prospects";

export type CrmResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string; fields?: string[] };

/**
 * Maps expected business failures to `{ ok:false, error }` for the UI. Authorization failures
 * (SALES_FORBIDDEN, EXIT_DEMO_FIRST) and unexpected errors keep throwing so they can never be mistaken for a form error.
 */
export async function crmAction<T extends object>(fn: () => Promise<T>): Promise<CrmResult<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (err) {
    if (err instanceof CrmError) return { ok: false, error: err.code };
    if (err instanceof ZodError) return { ok: false, error: "INVALID", fields: [...new Set(err.issues.map((i) => String(i.path[0] ?? "")))] };
    throw err;
  }
}

/** Prisma unique-violation (P2002) → CrmError(code); anything else rethrown. */
export function mapUniqueViolation(err: unknown, code: string): never {
  if (typeof err === "object" && err && (err as { code?: string }).code === "P2002") throw new CrmError(code);
  throw err;
}
