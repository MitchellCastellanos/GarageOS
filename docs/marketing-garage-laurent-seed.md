# Taller de muestra «Garage Laurent» — seed para capturas de marketing

> Clave del dataset: `marketing-garage-laurent-v1` · Slug: `garage-laurent-demo` · Script: `scripts/seed-marketing-garage-laurent.ts`
> Plan puro y verificable: `scripts/marketing/garage-laurent-dataset.ts` · Tests: `tests/marketing-garage-laurent.test.ts`

Este seed crea un taller ficticio completo (clientes, vehículos, citas, inspección, estimado aprobado, orden de trabajo,
factura pagada, inventario, recordatorios, almacenamiento de neumáticos y una campaña en borrador) con un dueño que entra
con email y contraseña. No envía nada, no llama a Stripe, Twilio, Resend ni QuickBooks, y no genera logos ni fotos.

## Comandos

```bash
# 1) Ensayo: ejecuta todo y revierte. El conteo que imprime es exacto.
npm run seed:marketing-garage-laurent -- --dry-run

# 2) Real. Opcional: fecha de referencia (America/Montreal) y archivo local para los enlaces sensibles.
npm run seed:marketing-garage-laurent -- --access-file=<ruta FUERA del repo>

# 3) Solo si necesitas un enlace nuevo del portal de Camille (revoca los activos):
npm run seed:marketing-garage-laurent -- --access-file=<ruta FUERA del repo> --issue-portal-link
```

Variables de entorno (nunca se imprimen):

| Variable | Cuándo |
| --- | --- |
| `DATABASE_URL` | Siempre. `db.ts` también lee `DATABASE_URL_POOLED` primero: no definas una URL que no quieras usar. |
| `DEMO_OWNER_PASSWORD` | Obligatoria la **primera** vez (mín. 8 caracteres). En reejecuciones no se lee ni se reescribe la contraseña. |
| `--allow-remote` | Obligatorio si la URL no es `localhost`/`127.0.0.1`. Es la protección contra producción. |

Cómo definir la contraseña:

```powershell
$env:DEMO_OWNER_PASSWORD = "<contraseña de muestra>"   # PowerShell, solo en la sesión actual
```
```bash
export DEMO_OWNER_PASSWORD="<contraseña de muestra>"   # bash / Git Bash
```

La contraseña inicial propuesta en el brief (`LaurentDemo!2026`) **no se guarda en el repo**: pásala por el entorno.

### Preview dedicada (no producción)

Usa una rama Neon de preview propia para esto, nunca `neondb` ni la base de integración `garageos_replay`.
Antes de correr, confirma en el panel de Neon que la URL pertenece a la rama de preview.

```bash
DATABASE_URL="<URL directa de la rama preview dedicada>" DEMO_OWNER_PASSWORD="<...>" \
  npm run seed:marketing-garage-laurent -- --dry-run --allow-remote
```

## Garantías del script

- **Idempotente por id estable.** Cada fila tiene id `mkt-gl-v1-…`. Lo que ya existe no se toca: no hay borrados ni
  actualizaciones de datos de negocio, así que un cambio hecho en la interfaz (por ejemplo aprobar el estimado de
  Alexandre) no se revierte al reejecutar. Verificado: segunda ejecución = 0 creados en todas las tablas.
- **Una transacción.** Si algo falla, no queda nada a medias.
- **Conflictos detenidos.** Si el slug, el id del taller o un correo del seed pertenecen a otra cuenta, se aborta antes de escribir.
  Verificado con un slug alterado: sale con código 1 y «no se escribió nada».
- **Stock y consumo sin duplicar.** La orden de Camille descuenta con `reconcileWorkOrderConsumption`, que es delta-based:
  reejecutar no vuelve a descontar. Verificado: 35 / 24 / 3 / 2 antes y después de la segunda ejecución.
- **Numeración real.** Folios por `allocateNext…` (INV / COT / OT), misma `DocumentSequence` que la app: la siguiente
  factura será `INV-0009` sin colisiones.
- **Correo del dueño sin avisos reales.** `receiveBillingNotifications=false`, sin `billingEmail`, sin IDs de Stripe.
- **Comunicaciones suspendidas.** `Shop.communicationsSuspendedAt` activo. No hay destinatarios listos para envío.
- **Enlaces sensibles fuera de la base.** El portal se guarda solo como SHA-256 (`tokenHash`) y caduca en 30 días.
  Los tokens de portal y aprobación solo se escriben al archivo indicado con `--access-file`, nunca a la consola (en POSIX el archivo se crea con permisos 0600; en Windows, guárdalo en una carpeta privada).

## Resultado de la ejecución de verificación

Entorno usado: Postgres 18.4 local en `localhost:54329` (base dedicada `garageos_marketing_local`, migraciones del repo
aplicadas con `prisma migrate deploy`). **No se usó ninguna base de producción ni de preview.** Sin conexión a servicios externos.

| Modelo | Creados (1.ª ejecución) | Segunda ejecución |
| --- | ---: | ---: |
| Shop / Subscription / ShopWorkingHours / ShopBookingService | 1 / 1 / 7 / 6 | 0 |
| User (owner, 2 mecánicos) / MechanicWorkingHours | 3 / 14 | 0 |
| Client / Vehicle | 8 / 8 | 0 |
| SavedLineItem | 8 | 0 |
| InventoryPart (+ movimientos RECEIVE / CONSUMED) | 4 (7 movimientos) | 0 |
| Quote / QuoteLineItem / QuoteApproval | 2 / 8 / 1 | 0 |
| WorkOrder / WorkOrderLine | 3 / 8 | 0 |
| Invoice / InvoiceLineItem / pagos / eventos financieros | 8 / 20 / 8 / 14 | 0 |
| Appointment (+ AppointmentEvent) | 11 | 0 |
| Inspection / InspectionItem | 1 / 6 | 0 |
| ServiceReminder / ReminderRule | 3 / 1 | 0 |
| CustomerPortalAccess | 1 | 0 |
| TireStorageSet (+ evento CHECK_IN) | 1 | 0 |
| Campaign | 1 | 0 |

Validaciones realizadas:

- Login real por HTTP (`/api/auth/callback/credentials`): sesión `OWNER`, redirección a `/admin/dashboard` sin onboarding ni bloqueo de plan.
- Páginas admin 200: dashboard, clientes, facturas, estimados, órdenes, citas, inventario, recordatorios, campañas, almacenamiento
  de neumáticos, inspecciones, reportes, contabilidad, configuración y caja.
- Públicas 200: `/book/garage-laurent-demo`, `/quote/<token>` (Alexandre), `/inspection/<token>` (Camille), `/portal/<token>`.
- PDF 200 (`application/pdf`): factura INV-0006 de Camille y estimado COT-0002 de Alexandre.
- Disponibilidad de reservas real: días reservables con horas libres; solo Mathieu y Olivier son reservables.
- Impuestos: en las 8 facturas, `subtotal + taxAmount = total` y `taxAmount` = suma del snapshot. Pagos = total en las 7 pagadas.
- Enlaces: COT-0001 ↔ INV-0006 ↔ OT-0001 ↔ inspección ↔ aprobación, todos coherentes.
- Tests: `tests/marketing-garage-laurent.test.ts` 10/10. `npm run typecheck` sin errores. ESLint limpio en los archivos nuevos.

Nota: en la verificación se detectó una confusión de zona horaria en mis propias consultas SQL (no en el seed): las
horas almacenadas son correctas en UTC (08:00 EDT = 12:00Z). El seed no necesita forzar `TZ`.

## Entrega

1. **Archivos:** `scripts/seed-marketing-garage-laurent.ts`, `scripts/marketing/garage-laurent-dataset.ts`,
   `tests/marketing-garage-laurent.test.ts`, `package.json` (script `seed:marketing-garage-laurent`), esta documentación.
2. **URL de login:** `<NEXT_PUBLIC_APP_URL>/admin/login`. Local: `http://localhost:3000/admin/login`.
   **Email:** `demo.garage.laurent@example.com`. **Contraseña:** la que pases en `DEMO_OWNER_PASSWORD` (propuesta en el brief).
3. **Logo y fotos de reserva (subir después):** `/admin/settings`, sección de la página de reservas (configurador).
   Ambas imágenes empiezan en `null`.
4. **Fotos de inspección:** `/admin/inspections` → inspección de Camille (la que tiene `workOrderId` a OT-0001) → botón de foto en
   cada hallazgo: **Pneus** (`TIRES`, ATTENTION) y **Freins avant** (`BRAKES`, SERVICE_REQUIRED). Los hallazgos ya existen; no hay fotos creadas.
5. **Abrir:** factura PDF `/admin/invoices` → INV-0006 (o `/api/invoices/mkt-gl-v1-inv-camille/pdf` con sesión);
   aprobación de Alexandre con el enlace `alexandreQuoteApproval` del archivo de acceso; reserva `/book/garage-laurent-demo`;
   portal con `camillePortal` del archivo de acceso.
6. **Pendiente por falta de servicios o assets:**
   - Logo, dos fotos de reserva y fotos de inspección (las subes tú).
   - Envíos reales: suspendidos a propósito. Las «vistas» de correo/SMS se generan en local sin enviar.
   - SMS conversacional de muestra (`CommunicationThread`): omitido. No hay forma compatible sin IDs de Twilio o estados
     de entrega falsos. Para capturarlo después, envía un SMS real a un número de prueba propio cuando haya número Twilio activo.
   - Color de acento `#C77845`: no existe campo compatible en el modelo; no se guardó.
   - Stripe, QuickBooks, número Twilio, dominio de envío y dominio propio: no configurados (intencional).
   - Festivo: el brief define lunes abierto y la app no conoce feriados; el 12 de octubre de 2026 (Action de grâce) aparece
     reservable. El plan de citas sí lo salta.
7. **Manifiesto sin secretos** (para que otro agente localice cada escenario):

| Escenario | Dónde buscarlo | Claves / ids |
| --- | --- | --- |
| Taller | `Shop` | `mkt-gl-v1-shop` · slug `garage-laurent-demo` |
| Dueño (login) | `User` | `mkt-gl-v1-user-etienne` · `demo.garage.laurent@example.com` |
| Mecánicos | `User` (sin login) | `mkt-gl-v1-user-mathieu`, `mkt-gl-v1-user-olivier` |
| Clientes | `Client` | `mkt-gl-v1-client-{camille,alexandre,sophie,nicolas,isabelle,francois,julie,marcandre}` |
| Vehículos | `Vehicle` | `mkt-gl-v1-vehicle-{clave}` · placas `DEMO-01`…`DEMO-08` |
| Citas del día demo (miércoles 7-oct-2026 con ref. 6-oct) | `Appointment` | `mkt-gl-v1-appt-demo-*` (5) |
| Citas futuras | `Appointment` | `mkt-gl-v1-appt-future-*` (3) |
| Citas pasadas | `Appointment` | `mkt-gl-v1-appt-past-civic-oil` (completada), `…-past-forester-oil` (completada), `…-past-sentra-brakes` (cancelada) |
| **Historia Camille** | `Quote` / `Inspection` / `WorkOrder` / `Invoice` | estimado `mkt-gl-v1-quote-camille` = COT-0001 · aprobación `mkt-gl-v1-approval-camille` · inspección `mkt-gl-v1-insp-camille` · OT `mkt-gl-v1-wo-camille` = OT-0001 · factura `mkt-gl-v1-inv-camille` = INV-0006 (pagada CARD) |
| Estimado pendiente Alexandre | `Quote` | `mkt-gl-v1-quote-alexandre` = COT-0002 (DRAFT, token de aprobación vigente 30 días) |
| Vehículo listo Sophie | `WorkOrder` / `Invoice` | `mkt-gl-v1-wo-sophie` = OT-0002 (READY_FOR_PICKUP, INVOICED) · `mkt-gl-v1-inv-sophie` = INV-0008 (DRAFT, pendiente) |
| En servicio Nicolas | `WorkOrder` | `mkt-gl-v1-wo-nicolas` = OT-0003 (IN_PROGRESS / IN_SERVICE) |
| Facturas históricas | `Invoice` | `mkt-gl-v1-inv-francois-1` (INV-0001), `…-nicolas-1` (INV-0002), `…-alexandre-1` (INV-0003), `…-isabelle-1` (INV-0004), `…-julie-1` (INV-0005), `…-francois-2` (INV-0007, pago en efectivo + `CashDrawerEntry`) |
| Inventario | `InventoryPart` | `mkt-gl-v1-part-{huile,filtre,plaquettes,essuie}` · SKU `GL-HUILE-020`, `GL-FILTRE-001`, `GL-FREIN-CIV19`, `GL-ESSUIE-001` (stock bajo) |
| Neumáticos de Alexandre | `TireStorageSet` | `mkt-gl-v1-tire-alexandre` · 225/65R17 · STORED |
| Recordatorios | `ServiceReminder` / `ReminderRule` | `mkt-gl-v1-rule-oil` · `mkt-gl-v1-rem-camille-oil` (100 450 km) · `mkt-gl-v1-rem-isabelle-rotation` · `mkt-gl-v1-rem-francois-oil` |
| Campaña | `Campaign` | `mkt-gl-v1-campaign-winter` · DRAFT · segmento `ALL_CONSENTED` · sin destinatarios |
| Portal Camille | `CustomerPortalAccess` | `tokenHash` SHA-256; enlace en el archivo de acceso (`camillePortal`) |

Decisiones de diseño a revisar:

- Impuestos con los nombres del preset de Québec del repo: `GST` 0.05 y `QST` 0.09975 (las etiquetas TPS/TVQ aparecen en la
  interfaz en francés). `Shop.taxId` queda `null`: no se inventó ningún número de registro fiscal.
- Plantilla `MODERN` y tipografía `MODERN` de la página de reservas (taller profesional). Ambas requieren plan PRO o superior: el plan es COMPLETE.
- Estimado de Camille y de Alexandre en `DRAFT`: nunca se marcó como enviado; la aprobación de Camille se registra con
  `channel = demo_seed_fictitious` y sin IP ni navegador. Factura de Camille creada por conversión (sin evento `INVOICE_ISSUED`, como en el flujo real).
- Las citas de Alexandre y Julie se marcan `PUBLIC_WEB` (fuente WEB) y no tienen enlace de gestión (`manageToken` nulo).
