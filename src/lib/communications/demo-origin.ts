import { AsyncLocalStorage } from "node:async_hooks";
import type { SalesDemo } from "@prisma/client";

// Internal delivery fallback context, derived only from a persisted message.
const origin = new AsyncLocalStorage<string>();
export function withCommunicationOrigin<T>(demoId: string | null, run: () => Promise<T>): Promise<T> {
  return demoId ? origin.run(demoId, run) : run();
}
export async function resolveDemoCommunication(shopId: string, demo?: SalesDemo | null): Promise<string | null> {
  if (demo && demo.status !== "CONVERTED") {
    const { authorizedDemoSession } = await import("@/lib/sales-demo");
    if (demo.shopId !== shopId || !demo.communicationsEnabled || !await authorizedDemoSession(demo)) throw new Error("DEMO_COMMUNICATION_FORBIDDEN");
    return demo.id;
  }
  return origin.getStore() ?? null;
}
