import NextAuth, { type NextAuthConfig, customFetch } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { provisionDefaultSenderIdentities } from "@/lib/communications/sender-identity";
import { createDefaultSubscription } from "@/lib/subscription";

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
          // Google ya confirmó este correo — no le pedimos verificarlo otra vez.
          emailVerified: new Date(),
        },
      });
      // Identidad de envío inicial (Communications Platform) — no bloquea el signup si falla.
      await provisionDefaultSenderIdentities(shop).catch((err) => {
        console.error("[communications] provisionDefaultSenderIdentities falló en signup:", err);
      });
      await createDefaultSubscription(db, shop.id).catch((err) => {
        console.error("[subscription] createDefaultSubscription falló en signup:", err);
      });
      return true;
    },
    async jwt({ token, user, trigger, session }) {
      // Disparado por unstable_update() en src/lib/platform/impersonation.ts —
      // arranca/termina el "login as" sin tocar la identidad real del super
      // admin (token.userId/shopId/role abajo siguen siendo los suyos).
      if (trigger === "update" && session && "impersonation" in session) {
        if (session.impersonation) {
          token.impersonation = session.impersonation;
        } else {
          delete token.impersonation;
        }
      }

      // Se re-resuelve shopId/role desde la DB en cada request (no solo en
      // el sign-in inicial) para que cambiar de ubicación activa
      // (switchActiveShop, multi-sucursal) tome efecto sin tener que cerrar
      // sesión. `user` solo viene en el sign-in inicial — ahí se busca por
      // email (Google no trae shopId/role en su perfil); después se busca
      // por token.userId, ya resuelto.
      const dbUser = user?.email
        ? await db.user.findUnique({
            where: { email: user.email },
            select: { id: true, shopId: true, role: true },
          })
        : token.userId
          ? await db.user.findUnique({
              where: { id: token.userId as string },
              select: { id: true, shopId: true, role: true },
            })
          : null;
      if (dbUser) {
        token.userId = dbUser.id;
        token.shopId = dbUser.shopId ?? undefined;
        token.role = dbUser.role;
      }

      // Auto-expira una impersonación vencida en vez de esperar a que alguien
      // llame endImpersonation() — así una pestaña olvidada abierta no queda
      // "viendo como el taller" indefinidamente.
      if (token.impersonation && token.impersonation.expiresAt < Date.now()) {
        delete token.impersonation;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.userId as string;
        session.user.shopId = token.shopId as string;
        session.user.role = token.role as string;

        // Mientras dura la impersonación, la sesión "ve" el taller
        // impersonado (shopId/role de OWNER) — la identidad real del super
        // admin queda intacta en el token para poder salir en cualquier momento.
        if (token.impersonation) {
          session.user.shopId = token.impersonation.shopId;
          session.user.role = "OWNER";
          session.impersonation = token.impersonation;
        }
      }
      return session;
    },
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // El discovery document de Google anuncia
      // `authorization_response_iss_parameter_supported: true`, pero sus
      // respuestas de autorización no siempre incluyen `iss` — oauth4webapi
      // entonces rechaza el callback con `response parameter "iss" missing`.
      // Se le quita esa bandera solo a la respuesta de discovery; el resto
      // (jwks/token/userinfo) sigue viniendo de Google sin tocar.
      [customFetch]: async (...args: Parameters<typeof fetch>) => {
        const response = await fetch(...args);
        const url = new URL(new Request(...args).url);
        if (!response.ok || url.pathname !== "/.well-known/openid-configuration") {
          return response;
        }
        const metadata = await response.json();
        delete metadata.authorization_response_iss_parameter_supported;
        return new Response(JSON.stringify(metadata), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      },
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

export const { handlers, signIn, signOut, auth, unstable_update } = NextAuth(authConfig);

// Helper para obtener la sesión y el shopId en Server Components y Actions
export async function getSession() {
  return auth();
}
