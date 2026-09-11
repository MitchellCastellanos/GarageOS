import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

import { ADMIN } from "@/lib/routes";

export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: ADMIN.login,
  },
  callbacks: {
    // Login con Google: self-serve. Si el correo no existe todavía, le
    // creamos su propio taller (Shop) y queda como OWNER — sin adapter de
    // BD, todo el enlace se resuelve por email en jwt() abajo.
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true;
      if (!user.email) return false;

      const existing = await db.user.findUnique({ where: { email: user.email } });
      if (existing) return true;

      const ownerName = user.name?.trim() || user.email.split("@")[0];
      const shop = await db.shop.create({
        data: { name: `Taller de ${ownerName}` },
      });
      await db.user.create({
        data: {
          shopId: shop.id,
          name: ownerName,
          email: user.email,
          role: "OWNER",
        },
      });
      return true;
    },
    async jwt({ token, user }) {
      // `user` solo viene en el sign-in inicial. Credentials ya trae
      // shopId/role, pero para Google (perfil sin esos campos) resolvemos
      // siempre por email — así el signIn() de arriba (que puede crear el
      // taller recién) queda reflejado de una.
      if (user?.email) {
        const dbUser = await db.user.findUnique({
          where: { email: user.email },
          select: { id: true, shopId: true, role: true },
        });
        if (dbUser) {
          token.userId = dbUser.id;
          token.shopId = dbUser.shopId ?? undefined;
          token.role = dbUser.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.userId as string;
        session.user.shopId = token.shopId as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        try {
          const email = credentials?.email as string | undefined;
          const password = credentials?.password as string | undefined;

          if (!email || !password) return null;

          const user = await db.user.findUnique({
            where: { email },
            select: {
              id: true,
              name: true,
              email: true,
              passwordHash: true,
              shopId: true,
              role: true,
            },
          });

          if (!user?.passwordHash) return null;

          const isValid = await bcrypt.compare(password, user.passwordHash);
          if (!isValid) return null;

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            shopId: user.shopId ?? undefined,
            role: user.role,
          };
        } catch (err) {
          console.error("[authorize] error:", err);
          return null;
        }
      },
    }),
  ],
};

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);

// Helper para obtener la sesión y el shopId en Server Components y Actions
export async function getSession() {
  return auth();
}
