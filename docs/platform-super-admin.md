# Panel de super admin (`/platform`)

GarageOS administrando talleres — separado por completo del `/admin` de cada
taller (eso es un taller administrando a sus propios clientes). Acceso vía
`Role.SUPER_ADMIN`, `requireSuperAdmin()` en `src/lib/permissions.ts`.

## Bootstrap de la cuenta

`PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD` / `PLATFORM_ADMIN_NAME` en
el entorno → `scripts/bootstrap-super-admin.ts`, corrido en cada deploy desde
`scripts/deploy-migrations.mjs`. Idempotente (upsert por email); sin esas
variables, no hace nada. Nunca hardcodear el password en el repo.

## Operaciones sobre un taller (`/platform/shops/[id]`)

Cuatro tabs (`src/components/admin/ShopAdminPanel.tsx`):

- **Cuenta** — dueño/usuarios, reset de password, suspender comunicaciones.
- **Uso** — actividad de 30 días, última actividad, red flags automáticas
  (inactividad 90d, facturas vencidas del taller, suscripción PAST_DUE/UNPAID),
  y el botón de impersonación.
- **Plan y facturación** — cambio de plan manual (`changeShopPlan`), contacto
  de facturación (`updateBillingContact`), cancelación (`cancelShopSubscription`)
  e historial de cancelaciones.
- **Notas y bitácora** — notas internas del equipo (nunca visibles al taller)
  y `PlatformAuditLog` de toda acción sensible sobre ese taller.

### Cambio de plan

`changeShopPlan(shopId, newPlan, reason)` — el motivo es obligatorio (mínimo
10 caracteres) y se le envía al taller por correo (`PlanChangedEmail`, "se te
cambió por concepto de..."). Si el taller tiene una suscripción de Stripe
real, mueve el price ahí también (`updateStripeSubscriptionPrice`, con
proration) para que Stripe y la fila de `Subscription` nunca queden
desincronizados.

### Cancelación

`cancelShopSubscription(shopId, reason)` — motivo obligatorio, cancela al
final del período pagado (nunca de inmediato), y registra el evento en
`SubscriptionCancellation` (histórico, nunca se sobrescribe — un taller puede
cancelar y reactivarse varias veces). Alimenta el % de cancelación del
dashboard de crecimiento. El taller también puede cancelar por su cuenta vía
el Billing Portal de Stripe; ese flujo llega por el webhook existente
(`src/app/api/stripe/webhook`), pendiente de capturar el motivo desde ahí
como mejora futura (hoy solo el camino de super admin captura motivo).

### Impersonación ("login as")

`startImpersonation(shopId)` / `endImpersonation()` en
`src/actions/platform.ts`. Implementado con un claim en el JWT
(`token.impersonation`, ver `src/lib/auth.ts`) actualizado vía
`unstable_update()` — la identidad real del super admin queda intacta en el
token para poder salir en cualquier momento. Expira sola a la hora (chequeo
en el callback `jwt`) además del botón "Salir" (banner en
`src/components/admin/ImpersonationBanner.tsx`, montado en
`src/app/admin/(shop)/layout.tsx`). Abre y cierra una fila en
`PlatformAuditLog`.

## Bitácora (`PlatformAuditLog`)

`src/lib/platform/audit.ts` — `logPlatformAction()`. Toda acción nueva de
`/platform` que toque datos de un taller debe registrar una fila aquí; es la
única fuente de "qué hizo GarageOS y por qué" para soporte/disputas. String
(no enum de Prisma) para `action`/`targetType`, igual que
`CommunicationAuditLog` — agregar una acción nueva no pide migración.

## Analytics (`/platform/analytics`)

Mismo enfoque que Montreal Spider Co: `PageView` de primera parte, sin
cookies, `visitorHash` es un hash unidireccional de IP+UA salado por día
(nunca se guarda IP cruda). `AnalyticsBeacon` (montado en
`src/app/layout.tsx`) dispara un beacon a `/api/track` en cada cambio de
ruta, excepto `/admin` y `/platform`. Cubre el sitio de marketing y
`/book/[slug]` (con `shopSlug` para poder filtrar tráfico por taller a
futuro). Dashboard: últimas 24h por hora, tendencia de 7/30/90 días
(vistas + visitantes únicos), páginas/referrers/dispositivo/navegador/país
más frecuentes, y talleres con más tráfico en su landing pública.

## Mensajería GarageOS↔taller (`/platform/messages`)

**No confundir con `CommunicationThread`** (eso es taller↔cliente). Modelos
`PlatformConversation`/`PlatformMessage`. Lado del taller:
`src/actions/support.ts` + `/admin/support` (nav "Ayuda"). Lado de super
admin: `src/actions/platform-messages.ts` + `/platform/messages`.

Flujo actual (sin bot todavía):

1. El taller manda un mensaje → se crea/reusa su conversación no cerrada,
   confirmación por correo en el primer mensaje de una conversación nueva
   (`notifySupportMessageReceived`).
2. Alerta al equipo de GarageOS — Telegram (`sendPlatformTelegramAlert`) +
   correo interno (`notifyAdminNewSupportMessage`) — una sola vez por espera
   (`staffAlertedAt`), igual que el patrón de escalamiento de MSC, para no
   spamear si el taller manda varios mensajes seguidos.
3. El super admin responde desde `/platform/messages/[id]` → correo de
   confirmación al taller (`notifySupportReply`), conversación pasa a `LIVE`.
4. Tiempo real opcional vía Pusher (`src/lib/platform/pusher.ts`,
   `NEXT_PUBLIC_PUSHER_KEY`) — sin esas variables, cada envío hace un append
   optimista local y el otro lado ve el mensaje al recargar/revalidar.

**Chatbot (fase 2, pendiente)**: la conversación de diseño quedó en el chat
del panel — se conecta igual que el bot de MSC (`@anthropic-ai/sdk`, tool
calling, `escalate_to_human`), con `ANTHROPIC_API_KEY`/`ANTHROPIC_CHAT_MODEL`
ya en `.env.example`. El schema ya soporta el flujo sin migración nueva:
alcanza con sumar el estado inicial de bot a `PlatformConversationStatus` y
la llamada al bot al crear la conversación en `sendSupportMessage`.

Correos de plataforma (`src/lib/platform/notify.ts`) van directo por Resend,
**fuera** del sistema de Communications del taller
(`src/lib/communications/*`) — esa es la relación taller↔cliente, esta es
GarageOS↔taller. Remitente: `EMAIL_FROM_PLATFORM` (cae a `EMAIL_FROM`).

## Crecimiento (`/platform`, home)

`getPlatformGrowth()` en `src/actions/platform.ts` — talleres totales/nuevos
(30/90d), MRR (suma de `PLAN_PRICING_CAD` por suscripción activa, prorrateado
a mensual si es anual), suscripciones por estado, % de cancelación de 30 días
(`cancelaciones(30d) / (activos + cancelados(30d))`) y altas por mes
(cohortes, últimos 6 meses).

## Fuera de alcance de esta primera versión (a propósito)

- Roles múltiples de staff de GarageOS — hoy un solo `SUPER_ADMIN` alcanza.
- Cambios de plan/cancelación editables directo desde el Dashboard de
  Stripe sin pasar por aquí quedan fuera del audit log — usar siempre
  `/platform` para que quede registrado.
- El chatbot de soporte (ver arriba) — mensajería humana funciona ya.
