# Notificaciones — política y hoja de ruta

Quién recibe qué, por qué canal, y cómo queda registrado. Complementa
`docs/communications-platform.md` (infraestructura de envío) con las reglas de
producto.

## Decisiones tomadas

1. **Un solo canal por aviso al cliente, salvo que el cliente pida los dos.**
   Política por defecto (`AUTO`/`SMS`): SMS primero, email de respaldo si no hay
   SMS posible o falla. `EMAIL` invierte el orden. `BOTH` es la única excepción
   — el cliente lo eligió expresamente (reserva web, su link de gestión, o el
   taller en su ficha). Ver `resolveNotifyChannelPlan` en `src/domain/sms.ts`.
2. **Confirmación automática siempre**: al crear la cita (web o manual) y en
   cada cambio que el cliente necesita saber (fecha/hora, servicio, cancelación,
   reapertura, cita reasignada a otro cliente). Los cambios internos (mecánico,
   notas, completar, no-show) solo quedan en el historial.
3. **Historial (paper trail) por cita** — `AppointmentEvent`: quién (staff /
   cliente / sistema), cuándo, qué cambió (antes → después) y el aviso enviado
   con su estado, enlazado a `CommunicationMessage` (texto exacto + estado de
   entrega). Se ve en la página de edición de la cita.
4. **Alertas internas del taller: solo app + email, nunca SMS.** Hoy por email
   (`src/lib/staff-alerts.ts`) a los OWNER con correo confirmado; la campana en
   la app (Fase 3) se alimenta de los mismos puntos de disparo. Ya no hay CC al
   taller en los correos al cliente ni SMS al teléfono público del taller.
5. **Correos de plataforma** (soporte) van a la persona que escribió o al
   contacto efectivo del taller — nunca a un `Shop.email` sin confirmar.

## Eventos

| Evento | Cliente | Taller |
|---|---|---|
| Cita creada (web o manual) | Confirmación | Email si vino de la web |
| Cita reprogramada / servicio cambiado | Aviso de cambio | — |
| Cita cancelada por el taller | Aviso de cancelación | — |
| Cita cancelada por el cliente (link) | Acuse de cancelación | Email |
| Cita reabierta | Confirmación | — |
| Recordatorio (cron) | Recordatorio | — |
| Vehículo listo | Aviso (una vez por orden) | — |
| Cotización aceptada/rechazada por el cliente | — | Email |
| Factura / cotización | Canal elegido por el admin al enviar | — |

La idempotencia de cada aviso de cita está atada al id del `AppointmentEvent`
(`appointment-sms:<tipo>:<citaId>:<eventoId>`), así una reprogramación o un
reenvío nunca se deduplica contra un aviso anterior del mismo tipo.

## SMS por taller

Implementado de punta a punta (ver también `docs/communications-activation-todo.md`
para los pasos de configuración en Twilio).

### Remitente

- **Número dedicado** (`ShopSmsNumber`): una subcuenta de Twilio por taller con su
  propio número. Solo GarageOS lo aprovisiona desde `/platform → taller → SMS`
  (compra un número real con renta mensual; la UI pide confirmación). El taller lo
  solicita desde Configuración → Notificaciones y la solicitud entra como mensaje de
  soporte.
- **Número compartido** (`TWILIO_FROM_NUMBER`): lo usan los talleres sin número
  propio. Sirve para avisos salientes; las respuestas no se pueden atribuir con
  certeza (ver "Entrantes").
- La fuente de verdad del remitente es `resolveShopSmsSender` (no las rutas por
  purpose, que solo anotan el envío). Todas las credenciales son las de la cuenta
  principal actuando sobre cada subcuenta: no se guardan tokens de subcuentas.

### Envío (`sendSms`, único punto de envío)

1. Remitente dedicado o compartido.
2. Si el teléfono respondió STOP a ese taller → `SmsOptedOutError`.
3. Segmentos estimados (`countSmsSegments`) contra el cupo del mes →
   `SmsAllowanceExceededError`.
4. Envío con `StatusCallback`; se guarda `numSegments` real.
5. Alerta a los owners al cruzar 80 % y 100 % (una vez por umbral y mes).

Los avisos automáticos (citas, vehículo listo) capturan esos errores y caen al email
— el cliente siempre queda avisado.

### Entrantes y SMS bidireccional

- `POST /api/webhooks/twilio/inbound` (firma X-Twilio-Signature validada con el token
  de la cuenta dueña del número). El taller se resuelve solo por `To` + `AccountSid`.
- Cada teléfono tiene un hilo SMS en el Inbox existente (`CommunicationThread.channel
  = SMS`, `contactAddress`), enlazado al cliente si su teléfono coincide. Se marca no
  leído (`lastInboundAt > readAt`) y el sidebar muestra el punto de Bandeja.
- Responder o escribir un SMS nuevo desde el Inbox exige número dedicado.
- En el número compartido, una respuesta se atribuye al último taller que le escribió
  a ese teléfono en los últimos 30 días; si no hay ninguno, se descarta.

### STOP / START / HELP

- Palabras en inglés y francés (`STOP`, `ARRET`, `START`, `HELP`, `AIDE`, …) solo si el
  mensaje es exactamente la palabra.
- STOP → `CommunicationSuppression` (SMS, UNSUBSCRIBE) + `Client.smsOptOutAt` y baja
  de marketing SMS. En el número compartido aplica a todos los talleres que le
  escribieron por ahí (el bloqueo del operador es por número).
- START → quita solo la supresión por STOP (nunca un bloqueo manual) y
  `smsOptOutAt`; no reactiva el consentimiento de marketing.
- HELP → queda registrado; la respuesta automática la envía Twilio.
- Twilio también responde y bloquea STOP/START por su cuenta; si igual intentamos
  enviar, el error 21610 del callback registra la supresión.

### Estado de entrega y respaldo diferido (SMS y email)

- `POST /api/webhooks/twilio/status` y el webhook de Resend (`email.delivered` /
  `email.bounced` / `email.complained`, ver `docs/communications-activation-todo.md`):
  estados monótonos (nunca retroceden, un estado terminal no se sobrescribe),
  actualización condicional (idempotente ante reintentos). Un bounce o queja de email
  suprime la dirección igual que un STOP de SMS.
- Si un aviso de cita o de vehículo listo termina fallando por SMS o por email (hasta
  48 h después), se reintenta por el otro canal y queda enlazado a su
  `AppointmentEvent` (`src/lib/notification-fallback.ts`). Facturas, cotizaciones y
  mensajes del Inbox no se reenvían por otro canal: los eligió una persona.

### Cupos y excedente

- `PLAN_LIMITS.smsSegmentsPerMonth` (CORE 300 / PRO 1000 / COMPLETE 2500 —
  **provisionales, a confirmar comercialmente**), o
  `Shop.smsMonthlyAllowanceOverride` fijado desde `/platform`.
- Mes calendario UTC; cuentan los segmentos salientes que llegaron a Twilio
  (incluidos los no entregados).
- **Al agotar el cupo, el SMS se sigue enviando** (nunca se bloquea ni cae a
  email por esto — decisión de producto). Los segmentos de más se cobran a
  `SMS_OVERAGE_PRICE_CAD_PER_SEGMENT` ($0.05 CAD, `src/domain/sms.ts`) vía
  Stripe Billing Meters (`reportSmsOverageUsage` en `src/lib/stripe.ts`,
  `CommunicationMessage.billedOverageSegments` guarda cuánto se reportó de
  cada mensaje). `computeOverageSegments` reparte correctamente un mensaje que
  cruza la frontera del cupo a la mitad.
- **Activación** (sin esto, el excedente se manda igual pero no se factura):
  1. Crear un Billing Meter en Stripe (Dashboard → Billing → Meters) y copiar
     su `event_name` a `STRIPE_SMS_OVERAGE_METER_EVENT_NAME`.
  2. Agregar un Price "metered" sobre ese Meter a $0.05 CAD/unidad, como item
     de la suscripción de cada taller (vía Stripe o incluido en el Checkout).
  3. La forma exacta de `stripe.billing.meterEvents.create` no se pudo
     verificar contra la referencia viva de Stripe en este entorno —
     confirmarla antes de depender de esto para facturar de verdad.
- Alertas de uso (80 %/100 % del cupo, una vez por umbral y mes) avisan a los
  owners; el mensaje del 100 % ahora dice que el excedente se factura, no que
  se corta el SMS.

### Ciclo de vida del número (cron diario)

- Taller que deja de estar al día (CANCELED/UNPAID/INCOMPLETE o trial vencido) →
  liberación programada a 30 días; el número sigue funcionando y se avisa a los owners.
- Si regulariza antes → se cancela la liberación (solo las programadas por el ciclo,
  no las manuales de GarageOS).
- Al vencer → el número vuelve a Twilio, la subcuenta se suspende (se reactiva si se
  vuelve a pedir número) y las rutas SMS regresan al número compartido.

## Fases

- **Fase 1 (hecha):** puntos 1–5 de "Decisiones tomadas".
- **SMS por taller (hecho):** número dedicado, SMS bidireccional en el Inbox, estados
  de entrega, STOP/START/HELP, cupos y ciclo de vida (sección anterior).
- **Canal preferido por cliente (hecho):** `AUTO | SMS | EMAIL | BOTH`, elegido en la
  reserva web, en el link de gestión (sin login) y en la ficha del taller.
- **Estados de entrega de email / respaldo diferido bidireccional (hecho):** ver
  "Estado de entrega y respaldo diferido (SMS y email)" arriba.
- **Centro de notificaciones en la app (hecho):** campana en tiempo real vía Pusher,
  bandeja de pendientes y preferencias por usuario — ver "Centro de
  notificaciones" más abajo.
- **Cobro de excedente de SMS (hecho, código):** el SMS ya no se bloquea al agotar
  el cupo — se factura a $0.05 CAD/segmento. Falta la activación en Stripe
  (crear el Meter y el Price, ver "Cupos y excedente" arriba) — sin eso, el
  excedente se manda igual pero no se factura de verdad.
- **Pendiente — registro A2P 10DLC automatizado** para números de EE. UU. Decisión de
  negocio: no se automatiza (el volumen de talleres en EE. UU. no justifica el costo
  de mantenerlo); el registro sigue siendo manual por taller si algún día se necesita.

## Centro de notificaciones (app)

`StaffNotification` (una fila por usuario destinatario) + `UserNotificationPreference`
(por usuario y evento: `inApp`/`email`, default ambos activos — sin fila = default).
Mismo dispatcher que las alertas por email de la Fase 1 (`sendStaffAlert` en
`src/lib/staff-alerts.ts`): para cada owner del taller decide, según su preferencia,
si crea la notificación en la app, si entra al lote de email de su idioma, o ambos.
La decisión de "quién recibe qué" es pura (`src/domain/staff-notify.ts`,
`planStaffAlertRecipients` / `groupEmailBatchByLanguage`) — testeada ahí porque
`staff-alerts.ts` en sí usa `import "server-only"`, que Next.js resuelve pero el test
runner (tsx) no (limitación del entorno, no del código; confirmado con `next build`).

Eventos: `STAFF_NEW_WEB_BOOKING`, `STAFF_CLIENT_CANCELLED_APPOINTMENT`,
`STAFF_QUOTE_DECIDED`, `STAFF_SMS_USAGE`, `STAFF_SMS_NUMBER_RELEASE_SCHEDULED`,
`STAFF_SMS_NUMBER_ACTIVATED` (catálogo en `src/lib/staff-notify-events.ts`).

- **Campana** (`src/components/layout/NotificationBell.tsx`): últimas 30, contador de
  no leídas, tiempo real por canal de Pusher **por usuario**
  (`staff-notifications-{userId}` — nunca por taller, para que un compañero no vea
  las notificaciones de otro). Sin Pusher configurado, sigue funcionando por
  polling al abrir el menú.
- **Preferencias**: Configuración → Notificaciones → "Alertas internas del equipo"
  (solo owners, mismo destinatario que las alertas). Un evento no puede quedar con
  los dos canales apagados (dejaría de existir para esa persona sin ningún rastro).
- Solo llega a los OWNER del taller — mismo alcance que ya tenían las alertas por
  email de la Fase 1. Ampliarlo a mecánicos/recepción es una mejora futura, no algo
  que este centro ya resuelva.
