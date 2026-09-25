# Notificaciones — política y hoja de ruta

Quién recibe qué, por qué canal, y cómo queda registrado. Complementa
`docs/communications-platform.md` (infraestructura de envío) con las reglas de
producto.

## Decisiones tomadas

1. **Un solo canal por aviso al cliente.** Política por defecto: **SMS primero**
   si el taller lo tiene activo y el cliente tiene teléfono; **email como
   respaldo** si no hay SMS posible o el SMS falla. Nunca los dos a la vez.
   (Fase 2 agrega la preferencia del propio cliente, que tendrá prioridad.)
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

### Estado de entrega y respaldo diferido

- `POST /api/webhooks/twilio/status`: estados monótonos (nunca retroceden, un estado
  terminal no se sobrescribe), actualización condicional (idempotente ante reintentos).
- Si un aviso de cita o de vehículo listo termina `FAILED` (hasta 48 h después), se
  reenvía por email y queda enlazado a su `AppointmentEvent`. Facturas, cotizaciones y
  mensajes del Inbox no se reenvían por otro canal: los eligió una persona.

### Cupos

- `PLAN_LIMITS.smsSegmentsPerMonth` (CORE 300 / PRO 1000 / COMPLETE 2500 —
  **provisionales, a confirmar comercialmente**), o
  `Shop.smsMonthlyAllowanceOverride` fijado desde `/platform`.
- Mes calendario UTC; cuentan los segmentos salientes que llegaron a Twilio
  (incluidos los no entregados). No hay cobro de excedente: al agotarse, email.

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
- **Pendiente — canal preferido por cliente** (`AUTO | SMS | EMAIL | BOTH`), elegido
  en la reserva web, en el link de gestión y en la ficha; estados de entrega de Resend
  (rebotes de email).
- **Pendiente — centro de notificaciones en la app** (campana en tiempo real vía
  Pusher, preferencias por usuario, resumen diario por email).
