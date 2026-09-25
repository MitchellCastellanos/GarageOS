# Communications Platform — pendientes para operar de a deveras

Este documento lista lo que falta conectar/configurar/decidir para que el módulo de
Communications (`docs/communications-platform.md`) funcione con datos e infraestructura
reales, no solo en el sandbox de desarrollo. Nada de esto bloquea el uso normal de
GarageOS hoy — Fases 1, 2, 3, 5 y 7 ya están activas y no requieren nada de esta lista.

## 0. Estado de entrega de email (Resend) — ACTIVO

`email.delivered` / `email.bounced` / `email.complained` ya se procesan (ver
`src/lib/communications/email-status.ts`): actualizan el estado del mensaje, un bounce
o una queja suprimen la dirección, y si un aviso automático de cita rebota se reintenta
por SMS. Para activarlo en producción:

1. En Resend, agregar un webhook apuntando a `https://<tu-dominio>/api/webhooks/resend`
   suscrito a `email.delivered`, `email.bounced` y `email.complained` (puede ser el
   mismo webhook del punto 1 si además se suscribe `email.received`).
2. Setear `RESEND_WEBHOOK_SECRET` con el signing secret (`whsec_...`) de ese webhook.
   `RESEND_INBOUND_WEBHOOK_SECRET` sigue funcionando como alias si ya estaba seteado.
3. El formato exacto del payload de bounce/complaint (`data.bounce.message`,
   `data.bounce.type`, `data.complaint.type`) no se pudo verificar contra la
   documentación viva de Resend — confirmarlo antes de depender del mensaje de error
   guardado en `CommunicationMessage.errorMessage`.

## 1. Activar email entrante (Fase 4)

El código vive en `src/app/api/webhooks/resend/route.ts` y responde 404 mientras no se
configure. Para activarlo:

1. En Resend, configurar recepción de correo en un dominio verificado (registro MX) o
   usar una dirección `.resend.app` para pruebas.
2. Agregar un webhook en el dashboard de Resend apuntando a
   `https://<tu-dominio>/api/webhooks/resend`, evento `email.received`, y copiar el
   signing secret (`whsec_...`).
3. Setear `RESEND_WEBHOOK_SECRET` (o `RESEND_INBOUND_WEBHOOK_SECRET`) en las variables de entorno de producción.
4. **Antes de confiar en esto en producción**: verificar contra la referencia viva de la
   API de Resend los endpoints exactos que usa el handler (`GET
   /emails/inbound/{id}` para el contenido y el endpoint de adjuntos) — se armaron a
   partir de la documentación pública de Resend porque `resend.com` no era alcanzable
   desde el sandbox donde se escribió este código, así que no se pudieron confirmar
   contra la referencia real.
5. Probar de punta a punta: responder a un correo transaccional real (o escribir a una
   dirección de una SenderIdentity activa) y confirmar que aparece como conversación
   nueva o respuesta en `/admin/inbox`.

## 2. SMS por taller — configuración en Twilio

El código está completo (ver `docs/notifications.md` → "SMS por taller"). El número
dedicado lo compra un super admin desde `/platform → taller → SMS`; nada lo compra
automáticamente. Pasos de operación:

1. **Cuenta principal de Twilio** con `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` en
   producción. Las subcuentas de los talleres se crean y se operan con esas mismas
   credenciales.
2. **URL pública de webhooks:** `NEXT_PUBLIC_APP_URL` (o `TWILIO_WEBHOOK_BASE_URL` si
   difiere) debe ser la URL https de producción: la firma de Twilio se calcula sobre
   ella. Los números dedicados quedan configurados solos al comprarlos con
   `<URL>/api/webhooks/twilio/inbound`; los callbacks de estado se piden por mensaje a
   `<URL>/api/webhooks/twilio/status`.
3. **Número compartido** (`TWILIO_FROM_NUMBER`): en la consola de Twilio, configurar
   su "A message comes in" → `POST <URL>/api/webhooks/twilio/inbound` para que los STOP
   y las respuestas lleguen.
4. **Costos:** cada número dedicado tiene renta mensual; la liberación automática a
   30 días de talleres que dejaron de pagar evita números huérfanos. Revisar en la
   consola que no queden números en subcuentas suspendidas.
5. **Cumplimiento:** los números se compran en `CA` por defecto (se puede elegir otro
   país y código de área). Para números de EE. UU. hace falta registro A2P 10DLC por
   taller antes de enviar volumen — no está automatizado.
6. **Cupos:** los valores de `PLAN_LIMITS.smsSegmentsPerMonth` son provisionales.

## 3. Variables de entorno / infraestructura a confirmar en producción

- `RESEND_WEBHOOK_SECRET` — nueva, requerida para los puntos 0 y 1 (un solo secreto para todos los eventos de Resend). `RESEND_INBOUND_WEBHOOK_SECRET` sigue funcionando como alias legado.
- `NEXTAUTH_SECRET` — ya existe, pero ahora también firma los tokens de unsubscribe de
  campañas (`src/lib/communications/suppression.ts`). Si se rota, todos los enlaces de
  baja ya enviados dejan de funcionar — coordinar con soporte antes de rotarlo.
- `CRON_SECRET` — ya existe. `/api/webhooks/cron/campaigns` corre una vez al día (9am,
  ver `vercel.json`) porque el plan de este proyecto es Hobby, que limita los cron jobs a
  una vez al día — un intento anterior de correrlo cada 15 min tiró el deploy
  (`Cron expressions that would run more frequently will fail during deployment`). Con
  cadencia diaria, una campaña grande se termina de enviar en varios días (tope de
  `GLOBAL_RECIPIENT_LIMIT_PER_RUN = 150` destinatarios por corrida, ver el propio archivo
  de la ruta). Si el proyecto sube a plan Pro, se puede: (a) programar esa ruta con más
  frecuencia en `vercel.json`, y (b) subir `GLOBAL_RECIPIENT_LIMIT_PER_RUN` y
  `maxDuration` (Pro permite funciones más largas que los 60s tope de Hobby usados hoy).
- Bucket privado `communications` en Supabase Storage — se crea solo en el primer uso
  (`ensureCommunicationsBucket`), pero conviene crearlo a mano de antemano y revisar las
  políticas de Storage del proyecto.

## 4. Huecos de producto dejados fuera a propósito (no bloquean, pero limitan)

- **Captura de consentimiento de marketing**: hoy solo existe un toggle manual en la
  ficha del cliente (`MarketingConsentToggle`). No hay checkbox de opt-in en el
  formulario de reserva pública ni en ningún flujo de checkout — sin eso, la audiencia
  de Campañas crece muy lento. Falta decidir dónde pedirlo y agregarlo.
- **Bounces/quejas de Resend no sincronizan supresión todavía**: `CommunicationSuppression`
  solo se llena por unsubscribe o por acción manual. Falta un webhook de Resend para
  `email.bounced` / `email.complained` que llame `addSuppression(...)` — doc §12.3 lo
  pide explícitamente.
- **Permisos MECHANIC/VIEWER**: siguen sin diferenciarse (gap heredado de antes de este
  módulo). Hoy cualquier usuario del taller puede leer/responder el Inbox y ver
  Campañas. Si se necesita restringir por rol, es trabajo aparte.
- **Anti-abuso de identidades incompleto**: existe tope de 20 identidades por taller y
  nombres reservados, pero no hay reautenticación para crear/renombrar identidades ni
  rate limit de creación (doc §4.4 los sugiere como capas adicionales).
- **Sin dashboard de deliverability** (bounces/quejas/volumen por taller) — doc §20 lo
  deja para una fase de hardening posterior.
- **`Campaign.bodyHtml` guarda texto plano a propósito** (nunca HTML real del tenant,
  por seguridad — ver doc §10.2). Si más adelante se quiere un editor visual real, hay
  que decidir cómo sanitizar antes de aceptar HTML del usuario; no usar ese campo para
  HTML sin agregar antes una librería de sanitización.

## 5. Pruebas que solo se pueden hacer con credenciales reales

- Envío real de email vía Resend (en este sandbox `RESEND_API_KEY` nunca fue una clave
  real, así que todos los envíos de prueba fallaron por diseño — la lógica de
  outbox/idempotencia/plantillas sí quedó verificada, la entrega real no).
- Una campaña real de punta a punta, incluyendo el cron corriendo en producción.
- El formulario de Contact Us contra un dominio público real.
