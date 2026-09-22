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

## Fases

- **Fase 1 (hecha):** puntos 1–5 de arriba.
- **Fase 2:** canal preferido por cliente (`AUTO | SMS | EMAIL | BOTH`), elegido
  en la reserva web, en el link de gestión y en la ficha; la elección se
  registra con origen y fecha. Webhook de estado de Twilio/Resend para
  "entregado / rebotó" y de STOP de Twilio.
- **Fase 3:** centro de notificaciones en la app (campana en tiempo real vía
  Pusher, bandeja de pendientes, web push opcional) y preferencias por usuario;
  email como respaldo o resumen diario.
- **Fase 4:** número de SMS propio por taller (subcuenta Twilio) y cupo de SMS
  por plan con respaldo automático a email al agotarse.
