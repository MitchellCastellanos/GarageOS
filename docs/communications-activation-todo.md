# Communications Platform — pendientes para operar de a deveras

Este documento lista lo que falta conectar/configurar/decidir para que el módulo de
Communications (`docs/communications-platform.md`) funcione con datos e infraestructura
reales, no solo en el sandbox de desarrollo. Nada de esto bloquea el uso normal de
GarageOS hoy — Fases 1, 2, 3, 5 y 7 ya están activas y no requieren nada de esta lista.

## 1. Activar email entrante (Fase 4)

El código vive en `src/app/api/webhooks/resend/route.ts` y responde 404 mientras no se
configure. Para activarlo:

1. En Resend, configurar recepción de correo en un dominio verificado (registro MX) o
   usar una dirección `.resend.app` para pruebas.
2. Agregar un webhook en el dashboard de Resend apuntando a
   `https://<tu-dominio>/api/webhooks/resend`, evento `email.received`, y copiar el
   signing secret (`whsec_...`).
3. Setear `RESEND_INBOUND_WEBHOOK_SECRET` en las variables de entorno de producción.
4. **Antes de confiar en esto en producción**: verificar contra la referencia viva de la
   API de Resend los endpoints exactos que usa el handler (`GET
   /emails/inbound/{id}` para el contenido y el endpoint de adjuntos) — se armaron a
   partir de la documentación pública de Resend porque `resend.com` no era alcanzable
   desde el sandbox donde se escribió este código, así que no se pudieron confirmar
   contra la referencia real.
5. Probar de punta a punta: responder a un correo transaccional real (o escribir a una
   dirección de una SenderIdentity activa) y confirmar que aparece como conversación
   nueva o respuesta en `/admin/inbox`.

## 2. Activar SMS por taller (Fase 6)

El código vive en `src/lib/communications/sms-provisioning.ts`
(`provisionShopTwilioSubaccount`) y hoy no lo llama nada — ni un cron, ni un botón.

1. Decidir el modelo de costos: ¿la renta mensual del número la paga GarageOS o se le
   cobra al taller? Esto determina si el aprovisionamiento debe ir detrás de un plan de
   pago o de un cargo aparte.
2. Construir la acción/UI (falta por completo) para que un OWNER dispare
   `provisionShopTwilioSubaccount(shopId, purpose)` con una confirmación explícita de
   costo — nunca automático.
3. Revisar el país por defecto (`"CA"` hardcoded) contra los mercados reales que atienda
   GarageOS; el doc explícitamente pide no asumir solo EE. UU./Canadá para siempre.
4. Probar con credenciales reales de Twilio — cada prueba compra un número real y genera
   cargos reales, así que probarlo aquí no era una opción.

## 3. Variables de entorno / infraestructura a confirmar en producción

- `RESEND_INBOUND_WEBHOOK_SECRET` — nueva, requerida solo para el punto 1.
- `NEXTAUTH_SECRET` — ya existe, pero ahora también firma los tokens de unsubscribe de
  campañas (`src/lib/communications/suppression.ts`). Si se rota, todos los enlaces de
  baja ya enviados dejan de funcionar — coordinar con soporte antes de rotarlo.
- `CRON_SECRET` — ya existe; confirmar que el plan de Vercel soporte la frecuencia nueva
  en `vercel.json` (`/api/webhooks/cron/campaigns` cada 15 min). El plan Hobby de Vercel
  limita los cron jobs a una vez al día — si el proyecto sigue en Hobby, hay que subir a
  Pro o ajustar el schedule antes de depender de las campañas programadas.
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
