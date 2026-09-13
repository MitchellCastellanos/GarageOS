# Brecha: lo que promete el homepage vs. lo que existe en el repo

Compara cada función que el landing page de marketing (`src/app/page.tsx` y
`src/lib/marketing-locale.ts`) le promete a un taller, contra lo que
realmente hay implementado hoy en el producto (`src/actions`, `src/app/admin`,
`prisma/schema.prisma`). Cruza el resultado con `docs/roadmap.md` (el plan
que ya existía) para terminar en una sola lista de construcción, priorizada.

Metodología: lectura directa del código — sin asumir nada del propio
homepage ni de los docs previos como verdad. "Implementado" significa que
hay una `action` y una pantalla que la ejecutan de punta a punta, no solo un
modelo en el schema.

**Corte anterior de este documento:** commit `4798dee`. Desde entonces se
cerraron los dos huecos de producto que quedaban pendientes de decisión
(Inventario y Multi-sucursal — se construyeron en vez de suavizar el
homepage) más tres arreglos de concurrencia (folios atómicos,
doble-booking de citas) y se confirmó que el arreglo de los botones "Get
Started" ya estaba resuelto. **Este corte deja una sola tarea grande
pendiente: Work Orders.**

**Fuera de alcance de este documento:** cobro por suscripción del propio
GarageOS y sus *gates* (qué se bloquea sin pagar). Se está revisando en
paralelo en otra sesión — no se lista aquí para no pisarlo.

## Tabla: promesa del homepage → estado real

| Promesa (homepage) | Estado | Evidencia |
| --- | --- | --- |
| Appointments & Scheduling | ✅ Implementado | `src/actions/appointments.ts`, `/book/[slug]`. **Invariante 8 resuelto para doble-booking**: el chequeo de conflicto de mecánico y la creación de la cita ahora corren dentro de una sola transacción `Serializable` (`createAppointment`, `updateAppointment` y la ruta pública `/api/book/[slug]`) — verificado con 10 intentos concurrentes reales contra Postgres: exactamente uno sobrevive. DST sigue sin probarse. |
| Work Orders & Estimates | ⚠️ Engañoso — **única brecha grande que queda** | El modelo `WorkOrder`/`WorkOrderLine` y `canTransitionWorkOrder` (`src/domain/work-order.ts`) existen, pero **cero** `actions` y **cero** pantalla. No se puede crear, ver ni editar una orden de trabajo desde la UI. Es la única función prometida en el homepage que sigue sin nada real detrás. |
| Invoicing & Payments | ✅ Implementado — folios ya atómicos | `src/actions/invoices.ts` (pagos CARD/CASH/MIXED), PDF. **Folios ahora son atómicos**: `DocumentSequence` (modelo nuevo) + upsert atómico en `src/lib/invoice-number.ts`, verificado con 25 asignaciones concurrentes reales sin duplicados; incluye backfill para talleres con facturas/cotizaciones previas. `taxRate` sigue combinado por documento sin normalizar (invariante 5 de `domain-model.md` — riesgo menor, no de concurrencia). |
| Customer Communication | ✅ Implementado | Inbox real (`src/app/admin/(shop)/inbox/**`), Campañas, dominios de email propios, outbox con idempotencia. Dos piezas siguen dormidas a propósito (`docs/communications-activation-todo.md`): email entrante y aprovisionamiento de SMS por taller — requieren credenciales/infra reales, no es trabajo de código pendiente. |
| Vehicle History & Records | ✅ Implementado | `Client` → `Vehicle`, `clients/[id]/vehicles/**`. |
| Inventory & Parts | ✅ Implementado — nuevo desde el corte anterior | `InventoryPart`/`InventoryMovement` (schema), `src/actions/inventory.ts`, `/admin/inventory` (lista, alta, detalle, edición, ajuste de stock con historial). Cantidad en existencia (`quantityOnHand`) es un total denormalizado que solo cambia dentro de una transacción junto con el movimiento que lo explica — nunca se edita directo. Ítem propio en el nav (`Package`). Verificado en navegador real: alta de refacción, consumo de stock, historial de movimientos. **No implementado a propósito**: descuento automático de stock al facturar una línea tipo "PART" — el módulo es autónomo por ahora, sin integración con Facturas/Cotizaciones. |
| Reports & Insights / Reports & analytics | ⚠️ Parcial | El dashboard "command center" (`src/app/admin/(shop)/dashboard/page.tsx`) incluye gráficas y un bloque de agenda de hoy. Sigue sin existir una sección "Reportes" separada con filtros/exportación propios. |
| Your Brand Everywhere / Branded emails & documents | ✅ Implementado | `Shop.logoUrl`/`name` en emails/PDFs/booking; dominio de email propio por taller. |
| Online & in-person booking | ✅ Implementado | `/book/[slug]` + `appointments/new`. |
| Estimates with approval flow | ✅ Implementado | `src/actions/quote-approvals.ts` + `/quote/[token]`. Token de un solo uso consumido en transacción, snapshot+hash del documento exacto, vencimiento verificado, envío por SMS. |
| Multi-techs and roles | ✅ Implementado, con un pendiente conocido | Roles `OWNER`/`MECHANIC`/`VIEWER`. **MECHANIC/VIEWER siguen sin diferenciarse en permisos** — cualquier usuario del taller puede leer/responder Inbox y ver Campañas hoy. Asignar técnico a una orden de trabajo puntual sigue dependiendo de que Work Orders exista. |
| Mobile friendly (shop floor ready) | ⚪ Parcialmente verificado | Nav con drawer móvil real (foco atrapado, cierre por Escape), topbar responsive. No se auditó el resto de las pantallas (formularios largos, tablas). |
| Multi-location support (plan Business) | ✅ Implementado — nuevo desde el corte anterior | `Organization` agrupa varios `Shop` (ubicaciones); `UserShopAccess` da acceso adicional a un usuario más allá de su taller de casa. `src/actions/locations.ts`: crear ubicación (crea la `Organization` automáticamente en la primera ubicación adicional), otorgar/revocar acceso, cambiar ubicación activa. El cambio de ubicación re-firma la sesión JWT (`unstable_update` en `src/lib/auth.ts`) sin cerrar sesión — verificado en navegador real de punta a punta: alta de ubicación, selector en el topbar, cambio reflejado en el siguiente render. Pestaña "Ubicaciones" en Configuración. **Límite a propósito**: es aislamiento a nivel de aplicación (mismo criterio que el resto del producto), no multi-organización con RLS; y no hay permisos distintos por ubicación — el acceso es binario según el `Role` global del usuario. |
| "Get Started" / "Set up your shop in minutes. No credit card required." | ✅ Implementado | Signup self-serve real (`/admin/signup`) y los botones "Get Started" del homepage ya apuntan a `/get-started` → `/admin/signup`, no a `/admin/login`. Cabo suelto del corte anterior, ya resuelto. |
| API access (pricing, ya etiquetado "coming soon") | ❌ No implementado | Consistente con su propia etiqueta. |

## Lo que falta, sin rodeos

**La tarea grande — la única que queda:**

1. **Work Orders no existe como función usable.** `src/actions/work-orders.ts`
   + pantallas en `src/app/admin/(shop)/work-orders/**`, usando
   `canTransitionWorkOrder` (`src/domain/work-order.ts`) como ya existe.
   Vincular con cita y con técnico asignado. Es la última función
   prometida en el homepage sin nada real detrás, y la que más se
   beneficiaría de aislamiento multi-taller sólido antes de un piloto con
   datos reales de más de un taller (ver punto siguiente).

**Residuales — no bloquean, no son "la próxima tarea grande", pero quedan anotados:**

- **Aislamiento multi-taller a nivel de aplicación, no DB.** Sigue sin
  claves compuestas ni RLS (invariante 1 de `domain-model.md`). No creció
  con multi-sucursal: `Organization`/`UserShopAccess` usan el mismo
  patrón de verificación por `shopId` que ya existía en cada acción.
- **Sección de Reportes propia** — separarla del dashboard si se mantiene
  la promesa como diferenciador.
- **Piezas dormidas de Communications** — email entrante y SMS por taller,
  bloqueadas por credenciales/infra real, no por código
  (`docs/communications-activation-todo.md`).
- **Roles MECHANIC/VIEWER sin diferenciar permisos** — para Inbox,
  Campañas, y ahora también para gestión de ubicaciones (hoy solo OWNER
  puede administrar ubicaciones, pero cualquiera con acceso puede operar
  en ellas sin distinción de rol).
- **Impuestos sin normalizar por documento** (`taxRate` combinado) — riesgo
  de cumplimiento fiscal, no de concurrencia (esa parte ya se resolvió).
- **DST sin probar** en la validación de reservas.
- **Descuento automático de inventario al facturar** — decisión de producto
  aparte: ¿una línea tipo "PART" en una factura debe descontar stock
  automáticamente? Hoy Inventario es un módulo autónomo.

Ya **no** están en esta lista (resueltos en este corte): Inventario y
refacciones, Multi-sucursal, folios atómicos, doble-booking de citas, y el
enlace de "Get Started" al signup real.

## Plan de construcción unificado (actualizado)

0. **Work Orders de punta a punta** — la única tarea grande restante. Ver
   arriba.
1. Sección de Reportes propia.
2. Diferenciar permisos MECHANIC/VIEWER (Inbox, Campañas, ubicaciones).
3. Normalizar impuestos por documento; probar DST en reservas.
4. Activar piezas dormidas de Communications cuando haya
   credenciales/infra real (no bloqueante).
5. Decidir si Inventario debe integrarse con Facturas/Cotizaciones
   (descuento automático de stock) — opcional, el módulo ya es usable de
   forma autónoma.

Cobro por suscripción y sus *gates* quedan fuera de este documento — se
sigue en paralelo en otra sesión.

Nada de esto reemplaza `docs/roadmap.md`, `docs/domain-model.md`,
`docs/reuse-audit.md`, `docs/communications-platform.md` ni
`docs/navigation-map.md` — los complementa con la vista específica de qué
promete el homepage que el producto todavía no cumple, a la fecha de este
corte.
