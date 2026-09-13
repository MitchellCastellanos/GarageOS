# Próximas entregas

Este roadmap refleja el estado actual del producto y las decisiones de alcance tomadas para llevar GarageOS a una V1 funcionalmente completa para talleres independientes. La prioridad es un flujo simple para dueño/front desk/service advisor; GarageOS no debe obligar al mecánico a operar un sistema complejo.

## Flujo objetivo de V1

Cliente / reserva → vehículo → cita → cotización → aprobación → orden de trabajo → inspección / trabajo → factura → pago → historial → recordatorio de mantenimiento.

El taller administra el estado del trabajo y las comunicaciones con el cliente. No se planea un Work Board/kanban complejo como requisito de V1.

## Estado actual y construcción priorizada

### 0. Work Orders de punta a punta

Completar la función usable de órdenes de trabajo aprovechando `WorkOrder`, `WorkOrderLine` y el state machine ya existentes. Debe integrarse con citas, clientes/vehículos, cotizaciones/aprobaciones, técnico asignado, facturación e historial sin crear sistemas paralelos.

### 1. En implementación — expansión operativa

Estas tres funciones están siendo construidas actualmente en una rama/PR separado. No se consideran terminadas hasta revisar y validar la implementación:

- **Vehicle / Job Status + customer notifications.** Estado operacional simple administrado por el taller (por ejemplo checked in, in service, waiting approval/parts, ready for pickup, completed), integrado con Work Orders donde corresponda. Notificación opcional por SMS/email — especialmente Ready for Pickup — reutilizando Communications y evitando duplicados. No convertir esto en un Work Board.
- **Service / Maintenance Reminders.** Recordatorios futuros asociados a cliente/vehículo (aceite, frenos, cambio estacional de neumáticos, mantenimiento y recordatorios personalizados), reutilizando la infraestructura de comunicaciones y con procesamiento idempotente.
- **Digital Vehicle Inspections (DVI).** Inspecciones móviles con estados tipo good / attention / service required, notas, recomendaciones y fotos/media usando la infraestructura existente. Los hallazgos deben integrarse naturalmente con Estimates/Quotes y Work Orders y quedar en el historial del vehículo.

### 2. Pendientes ya identificados en el producto

- **Reports & Analytics completos.** Separar una sección de Reportes del dashboard con filtros/exportación útiles.
- **Permisos más finos.** Diferenciar MECHANIC/VIEWER donde hoy comparten acceso excesivo. Es importante, pero no debe bloquear la construcción de funciones operativas de mayor valor.
- **Inventario integrado con el flujo de trabajo/facturación.** Decidir e implementar el consumo automático y movimientos de inventario cuando una pieza realmente se utiliza/factura, sin romper el ledger transaccional existente.
- **Impuestos.** Normalizar el modelo fiscal por documento según corresponda y validar las reglas aplicables antes del piloto.
- **Agenda/DST.** Completar pruebas de cambios de horario/DST.
- **Communications en producción.** Activar las piezas que requieren credenciales/infra real (incluido aprovisionamiento SMS por taller) manteniendo idempotencia y configuración de remitentes.
- **Suscripciones y gates.** Cerrar billing, tiers y qué funciones se habilitan por plan antes del lanzamiento comercial.
- **Aislamiento multi-taller.** Mantener pruebas estrictas de aislamiento y endurecer la persistencia/ownership donde sea necesario antes de datos reales de múltiples talleres.

### 3. Nuevas funciones pendientes, de menor a mayor alcance aproximado

1. **Data Import / Migration.** Importación asistida de clientes, vehículos e inventario desde CSV/Excel, con mapeo, validación y preview para facilitar migraciones desde otros sistemas.
2. **Tire Storage.** Juegos summer/winter por vehículo, medidas, condición, ubicación física, check-in/out, notas y etiquetas/QR cuando aporten valor.
3. **Accounting Light + QuickBooks Online.** Mantener GarageOS enfocado en operación: invoices, payments, taxes, refunds y sincronización/exportación con QuickBooks. No construir un sistema contable completo.
4. **Customer Portal — última prioridad.** Cuando el resto del dominio esté maduro, exponer al cliente vehículos, historial, citas, inspecciones, cotizaciones/aprobaciones, facturas y pagos. Diseñarlo al final para reutilizar los sistemas ya terminados en lugar de crear lógica paralela.

## Decisiones explícitas de alcance

- **VIN lookup/scanning: fuera.** No se planea construir funcionalidad VIN como requisito del producto.
- **Work Board / kanban: fuera de V1.** El flujo principal será controlado por front desk/admin mediante estados simples.
- **Two-way SMS: futuro.** V1 puede enviar notificaciones y recordatorios; conversación SMS bidireccional queda para una etapa posterior.
- **Purchase Orders / Suppliers: fuera del alcance actual.** No construir por ahora.
- **Full accounting: fuera.** Preferir accounting light + integración con QuickBooks.
- **Public API: futuro.** Mantener como `coming soon` hasta después de cerrar el producto principal.
- **Technician time clock/payroll: no es requisito core de V1.** Reconsiderar después del lanzamiento si los talleres lo demandan.

## Criterio de producto completo para V1

GarageOS debe cubrir coherentemente:

- adquisición: landing/website + online booking + reminders;
- recepción: customer + vehicle + appointment + estimate;
- autorización: DVI + evidencia + estimate + approval;
- trabajo: Work Order + parts/labour + status;
- cliente: actualizaciones + Ready for Pickup;
- dinero: invoice + payment + receipt + integración contable ligera;
- retención: vehicle history + maintenance reminders + campaigns;
- gestión: inventory + tire storage + reports + multi-location.

El Customer Portal complementará este flujo al final; no es un bloqueador para considerar funcionalmente completo el flujo interno del taller.

## Antes del piloto/lanzamiento

Además de terminar las funciones, validar con datos sintéticos y luego con talleres piloto: aislamiento entre shops, permisos, concurrencia/idempotencia, backups/restauración, fiscalidad aplicable, comunicaciones reales, responsive/mobile, migraciones de datos y billing/gates. `npm run check` o un build verde por sí solos no demuestran que el producto esté listo para usuarios reales.
