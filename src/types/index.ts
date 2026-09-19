// Extend NextAuth session types with shopId, role e impersonación ("login as")
import "next-auth";
import "next-auth/jwt";

/** Estado de impersonación activa ("login as") — ver src/lib/platform/impersonation.ts. */
export interface ImpersonationClaim {
  shopId: string;
  shopName: string;
  startedByUserId: string;
  startedByName: string;
  expiresAt: number;
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      shopId?: string | null;
      role: string;
    };
    /** Presente solo mientras un super admin está impersonando este taller. `null` limpia el estado explícitamente (endImpersonation). */
    impersonation?: ImpersonationClaim | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    shopId?: string | null;
    role?: string;
    impersonation?: ImpersonationClaim;
  }
}
