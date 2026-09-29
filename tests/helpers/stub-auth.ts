// Sesión de prueba para las server actions bajo node:test (ver action-harness.ts).
export interface TestSession {
  user: { id: string; role: string; shopId: string | null; email?: string };
}
let current: TestSession | null = null;
export function setSession(s: TestSession | null) {
  current = s;
}
export async function auth() {
  return current;
}
export async function unstable_update() {}
