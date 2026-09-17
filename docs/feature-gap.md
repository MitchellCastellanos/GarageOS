# Brecha de producto — GarageOS

Este documento complementa `docs/roadmap.md`: separa lo que ya existe, lo que ya estaba identificado como pendiente y el nuevo alcance decidido para una V1 funcionalmente completa.

La regla sigue siendo la misma: una función no cuenta como implementada solo porque exista un modelo o aparezca en marketing. Debe existir un flujo usable de punta a punta y mantener aislamiento por taller.

## Estado confirmado del producto

| Área | Estado | Nota |
| --- | --- | --- |
| Appointments & Scheduling | ✅ Implementado | Booking público y administrativo; protección de doble-booking ya validada. DST sigue pendiente de prueba específica. |
| Work Orders | ✅ Implementado | CRUD completo (lista/detalle/crear/editar), transiciones de estado vía `canTransitionWorkOrder`, técnico asignado, generación desde cotización aceptada (una orden por vehículo), conversión a factura borrador y sección en el historial del vehículo. |
| Invoicing & Payments | ✅ Implementado | Pagos, PDF y folios atómicos. Queda normalización fiscal como residual. |
| Customer Communication | ✅ Base implementada | Inbox, Campaigns, dominios propios y outbox idempotente. Algunas piezas de producción dependen de infraestructura/credenciales reales. |
| Clients / Vehicles / History | ✅ Implementado | Base para las nuevas funciones de mantenimiento e inspección. |
| Inventory & Parts | ✅ Implementado | Módulo autónomo y ledger de movimientos. Integración automática con uso/facturación de piezas sigue pendiente. |
| Reports & Analytics | ⚠️ Parcial | Dashboard tiene insights; falta sección de Reports completa. |
| Branding | ✅ Implementado | Branding en emails/PDFs/booking y dominio propio por taller. |
| Estimates + customer approval | ✅ Implementado | Token, snapshot/hash, expiración y aprobación. Debe reutilizarse para DVI en vez de crear otro approval flow. |
| Roles | ⚠️ Parcial | OWNER/MECHANIC/VIEWER existen; MECHANIC y VIEWER necesitan diferenciación adicional. |
| Multi-location | ✅ Implementado | Organization, accesos y cambio de ubicación. Aislamiento sigue siendo principalmente application-level. |
| Signup | ✅ Implementado | Self-service signup funcional. |
| Public API | ⏳ Futuro | Mantener como `coming soon`. |

## Actualmente en implementación

### Vehicle / Job Status + customer notifications — ✅ Implementado

`WorkOrder.jobStatus` (CHECKED_IN, WAITING_APPROVAL, WAITING_PARTS, IN_SERVICE, READY_FOR_PICKUP, COMPLETED) administrado por el front desk desde la lista y el detalle de Work Orders — no es un Work Board/kanban. Al marcar Ready for Pickup se notifica al cliente por email y/o SMS reutilizando Communications (nuevo canal/purpose `WORK_ORDER`), de forma idempotente vía `readyForPickupNotifiedAt` (una sola notificación por orden). El taller controla ambos canales desde Configuración (`Shop.workOrderReadyNotifyEmail` / `workOrderReadyNotifySms`).

### Service / Maintenance Reminders — ✅ Implementado

Recordatorios futuros asociados a cliente/vehículo para aceite, frenos, mantenimiento estacional y servicios personalizados, aprovechando Communications.

### Digital Vehicle Inspections (DVI) — pendiente

Objetivo: inspecciones digitales utilizables en móvil/tablet con estados equivalentes a good / attention / service required, notas, recomendaciones y fotos/media. Deben vivir en el historial del vehículo y reutilizar Estimates/Quotes + approval para convertir hallazgos en trabajo autorizable sin reescribir la información.

La implementación debe reutilizar media/storage, public-token flows, Work Orders y aislamiento existentes donde corresponda.

## Pendientes que YA estaban identificados

Estos no son descubrimientos nuevos y no deben duplicarse como nuevas features:

- Work Orders de punta a punta.
- Reports completos.
- Diferenciación de permisos MECHANIC/VIEWER.
- Normalización fiscal/impuestos por documento.
- Pruebas DST en booking.
- Activación de piezas de Communications dependientes de infraestructura real.
- Decisión/implementación de integración Inventory → piezas utilizadas/facturadas.
- Aislamiento multi-taller más fuerte y validación antes del piloto.
- Subscription billing y feature gates, mantenidos como track paralelo.

## Nuevas funciones pendientes después del bloque actual

Orden aproximado por esfuerzo de implementación, excepto Customer Portal que queda deliberadamente al final:

1. **Data Import / Migration** — CSV/Excel para clientes, vehículos e inventario, con mapping, validación y preview.
2. **Tire Storage** — juegos summer/winter, medidas, condición, ubicación, check-in/out, notas y etiquetas/QR cuando sea útil.
3. **Accounting Light + QuickBooks Online** — sincronizar/exportar invoices, payments, taxes/refunds y estados necesarios. GarageOS no debe convertirse en un sistema contable completo.
4. **Customer Portal — último** — vehículos, historial, citas, DVI, estimates/approvals, invoices y payments. Construir cuando los dominios internos estén estables para que sea principalmente una superficie sobre sistemas existentes.

## Decisiones de producto — NO construir ahora

- **VIN lookup/scanning: eliminado del alcance.** No es una función que queramos perseguir actualmente.
- **Work Board/kanban: eliminado de V1.** Preferimos status simple administrado por front desk/admin.
- **Two-way SMS: futuro.** No es requisito de lanzamiento.
- **Purchase Orders/Suppliers: fuera.** No priorizar.
- **Full accounting: fuera.** Integración ligera con QuickBooks en su lugar.
- **Public API: futuro.**
- **Technician time clock/payroll: post-lanzamiento si aparece demanda real.**

## Flujo objetivo de GarageOS V1

Customer/booking → vehicle → appointment → estimate → approval → Work Order → DVI/work → status → invoice → payment → vehicle history → maintenance reminder.

El producto debe permitir que un taller independiente opere ese flujo principalmente desde recepción/administración. La interacción del técnico puede mantenerse deliberadamente simple.

### Qué significa “V1 completa”

- **Adquisición:** landing/website, online booking, appointment communications.
- **Recepción:** clients, vehicles, appointments, estimates.
- **Autorización:** DVI, evidencia, estimate, approval.
- **Trabajo:** Work Orders, parts/labour, operational status.
- **Cliente:** notificaciones, especialmente Ready for Pickup.
- **Dinero:** invoice, payment, receipt, accounting-light/QuickBooks.
- **Retención:** vehicle history, maintenance reminders, campaigns.
- **Gestión:** inventory, tire storage, reports, multi-location.

Customer Portal queda deliberadamente después de este núcleo.

## Validaciones de lanzamiento que no son features

Antes de exponer GarageOS a datos reales de varios talleres todavía deben tratarse como launch-critical: aislamiento tenant/shop, ownership de relaciones y media, concurrencia e idempotencia, fiscalidad Quebec/Canadá aplicable, backups/restauración, communications reales, responsive/mobile, importación/migración y subscription gates.

Este documento debe actualizarse otra vez cuando el PR de Status + Reminders + DVI se revise: solo entonces esas tres funciones pasan de **EN IMPLEMENTACIÓN** a **IMPLEMENTADAS**.
