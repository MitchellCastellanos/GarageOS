import NextAuth, { type NextAuthConfig, customFetch } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { RATE_LIMITS, checkRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { provisionDefaultSenderIdentities } from "@/lib/communications/sender-identity";
import { createPendingSubscription } from "@/lib/subscription";

import { ADMIN } from "@/lib/routes";
import { isDemoAvailable } from "@/domain/sales-demo";
import { salesStaffStatus } from "@/lib/sales-crm/staff-status";

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
      // Shop + OWNER + Subscription (AWAITING_PLAN) en UNA transacción: un fallo a
      // medias no deja un taller sin fila de suscripción. El plan y el método de
      // pago se eligen después, en el onboarding (Stripe Checkout).
      let shop;
      try {
        shop = await db.$transaction(async (tx) => {
          const created = await tx.shop.create({ data: { name: `Taller de ${ownerName}` } });
          await tx.user.create({
            data: {
              shopId: created.id,
              name: ownerName,
              email: user.email!,
              role: "OWNER",
              // Google ya confirmó este correo — no le pedimos verificarlo otra vez.
              emailVerified: new Date(),
            },
          });
          await createPendingSubscription(tx, created.id);
          return created;
        });
      } catch (err) {
        console.error("[auth] signup con Google falló:", err);
        return false;
      }
      // Identidad de envío inicial (Communications Platform) — no bloquea el signup si falla.
      await provisionDefaultSenderIdentities(shop).catch((err) => {
        console.error("[communications] provisionDefaultSenderIdentities falló en signup:", err);
      });
      return true;
    },
    async jwt({ token, user, trigger, session }) {
      // Las autorizaciones (userId/shopId/role) NUNCA se heredan de los claims del JWT: una firma válida
      // solo prueba que el token lo emitió alguien con el secreto (este entorno u otro que lo comparta,
      // o una sesión anterior a que el usuario cambiara/se borrara). Se derivan SIEMPRE de la DB DE ESTE
      // ENTORNO en cada request — así cambiar de ubicación activa (switchActiveShop) o de rol toma efecto
      // sin cerrar sesión. `user` solo viene en el sign-in inicial — ahí se busca por email (Google no
      // trae shopId/role en su perfil); después se busca por token.userId.
      const dbUser = user?.email
        ? await db.user.findUnique({
            where: { email: user.email },
            select: { id: true, shopId: true, role: true },
          })
        : typeof token.userId === "string" && token.userId
          ? await db.user.findUnique({
              where: { id: token.userId },
              select: { id: true, shopId: true, role: true },
            })
          : null;

      // Usuario inexistente / no validable aquí (borrado, de otra base de datos, sin identidad de
      // aplicación): el token NO conserva ningún claim privilegiado — se devuelve null y Auth.js
      // destruye la sesión (la cookie se limpia). Falla cerrado.
      if (!dbUser) return null;

      // Platform sales staff (no shop, not Super Admin) lose their session the moment the staff account is
      // not ACTIVE: deactivation revokes access on the very next request, JWTs notwithstanding.
      const staffStatus = !dbUser.shopId && dbUser.role !== "SUPER_ADMIN" ? await salesStaffStatus(dbUser.id) : null;
      if (staffStatus && staffStatus !== "ACTIVE") return null;
      const staffActive = staffStatus === "ACTIVE";

      token.userId = dbUser.id;
      token.shopId = dbUser.shopId ?? undefined;
      token.role = dbUser.role;

      // Disparado por unstable_update() en src/lib/platform/impersonation.ts —
      // arranca/termina el "login as" sin tocar la identidad real del super
      // admin (token.userId/shopId/role arriba siguen siendo los suyos). Solo un SUPER_ADMIN
      // vigente en la DB puede iniciar una impersonación.
      if (trigger === "update" && session && "impersonation" in session) {
        if (session.impersonation && (dbUser.role === "SUPER_ADMIN" || staffActive)) {
          token.impersonation = session.impersonation;
        } else {
          delete token.impersonation;
        }
      }

      // Una impersonación solo vale si el usuario REAL sigue siendo SUPER_ADMIN en la DB (un claim
      // `impersonation` de un token viejo/foráneo no otorga acceso a ningún taller).
      if (token.impersonation && dbUser.role !== "SUPER_ADMIN" && !staffActive) {
        delete token.impersonation;
      }

      // Auto-expira una impersonación vencida en vez de esperar a que alguien
      // llame endImpersonation() — así una pestaña olvidada abierta no queda
      // "viendo como el taller" indefinidamente.
      if (token.impersonation && token.impersonation.expiresAt < Date.now()) {
        delete token.impersonation;
      }

      // Re-check the demo relationship/lifecycle every request. An expired open
      // tab returns to the real platform identity, never an unrestricted OWNER.
      if (token.impersonation?.salesDemoId) {
        const demo = await db.salesDemo.findUnique({ where: { id: token.impersonation.salesDemoId } });
        if (!demo || demo.shopId !== token.impersonation.shopId ||
            token.impersonation.startedByUserId !== dbUser.id || !isDemoAvailable(demo)) {
          delete token.impersonation;
        }
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

          // Per-account brute-force throttle (Block 15). This is the real gate: /api/auth/callback/credentials
          // reaches authorize() directly, bypassing /api/auth/login.
          const emailRule = RATE_LIMITS.loginEmail(email);
          if (!(await checkRateLimit(emailRule)).allowed) return null;

          const user = await db.user.findUnique({
            where: { email },
            select: {
              id: true,
              name: true,
              email: true,
              passwordHash: true,
              shopId: true,
              role: true,
              emailVerified: true,
            },
          });

          if (!user?.passwordHash) return null;

          const isValid = await bcrypt.compare(password, user.passwordHash);
          if (!isValid) return null;

          // El dueño es el contacto de facturación por defecto — bloqueamos
          // su login hasta que confirme el correo para no quedarnos sin
          // forma de avisarle algo importante (cambio de plan, cobro
          // fallido). Staff (mecánico/viewer) solo ve el banner, nunca se
          // bloquea — ver src/app/api/auth/login/route.ts para el mensaje
          // amigable que precede a este bloqueo real.
          if (user.role === "OWNER" && !user.emailVerified) return null;

          // Platform sales staff (no shop) can only sign in while their staff account is ACTIVE.
          if (!user.shopId && user.role !== "SUPER_ADMIN") {
            const staffStatus = await salesStaffStatus(user.id);
            if (staffStatus && staffStatus !== "ACTIVE") return null;
          }

          await resetRateLimit(emailRule);

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
