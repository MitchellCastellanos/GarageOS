// Extend NextAuth session types with shopId and role
import "next-auth";

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
  }
}
