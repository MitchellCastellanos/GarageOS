# Brecha: lo que promete el homepage vs. lo que existe en el repo

Compara cada función que el landing page de marketing (`src/app/page.tsx` y
`src/lib/marketing-locale.ts`) le promete a un taller, contra lo que
realmente hay implementado hoy en el producto (`src/actions`, `src/app/admin`,
`prisma/schema.prisma`). Cruza el resultado con `docs/roadmap.md` (el plan
que ya existía) para terminar en una sola lista de construcción, priorizada.

Metodología: lectura directa del código — sin asumir nada del propio
homepage ni de los docs previos como verdad. "Implementado" significa que
hay una `action` y una pantalla en `src/app/admin` que la ejecutan de punta
a punta, no solo un modelo en el schema.

## Tabla: promesa del homepage → estado real

| Promesa (homepage) | Estado | Evidencia |
| --- | --- | --- |
| Appointments & Scheduling | ✅ Implementado | `src/actions/appointments.ts`, `src/app/admin/(shop)/appointments/**`, `src/lib/booking-slots.ts`, `/book/[slug]`. Invariante 8 de `domain-model.md` (traslapes/DST en transacción) no confirmado. |
| Work Orders & Estimates | ⚠️ Engañoso | "Estimates" (cotizaciones) sí existe. **"Work Orders" no.** Solo hay el modelo `WorkOrder`/`WorkOrderLine` en el schema y una función pura de transición de estado (`src/domain/work-order.ts`, `canTransitionWorkOrder`). No existe `src/actions/work-orders.ts` ni ninguna pantalla en `src/app/admin`. No se puede crear, ver ni editar una orden de trabajo desde la UI hoy. El mockup del dashboard en el homepage muestra "3 work orders in progress" como si fuera una pantalla real. |
| Invoicing & Payments | ✅ Implementado | `src/actions/invoices.ts` (pagos CARD/CASH/MIXED), PDF (`src/lib/pdf.ts`, `InvoiceDocument.tsx`). Folios atómicos e impuestos normalizados: no confirmado (invariantes 5–6 de `domain-model.md`). |
| Customer Communication | ✅ Parcial | Emails transaccionales (cita, factura, cotización, recordatorio) vía Resend, SMS vía Twilio. El mockup del dashboard incluye un ítem de nav "Messages" que no corresponde a ninguna sección real — no hay mensajería/chat en el producto. |
| Vehicle History & Records | ✅ Implementado | `Client` → `Vehicle`, `src/lib/vehicle-catalog.ts`, `clients/[id]/vehicles/**`. |
| Inventory & Parts | ❌ No implementado | Cero modelo en `prisma/schema.prisma`, cero acción, cero pantalla. `docs/product.md` ya lo marcaba fuera de alcance ("inventario avanzado"). Se promete tanto en el feature strip como en los planes Pro y Business del pricing. |
| Reports & Insights / Reports & analytics | ⚠️ Parcial | Solo gráficas embebidas en el dashboard (`RevenueChart.tsx`, `StatusPie.tsx`, `src/lib/revenue-analytics.ts`). No hay una sección "Reportes" separada con filtros o exportación, que es lo que el nombre insinúa. |
| Your Brand Everywhere / Branded emails & documents | ✅ Implementado | `Shop.logoUrl`/`name` se usan en emails, PDFs y el sitio de reservas (`ShopSettingsForm.tsx`, `EmailRoutingPreview.tsx`). |
| Online & in-person booking | ✅ Implementado | `/book/[slug]` (público) + `appointments/new` (admin). |
| Estimates with approval flow | ❌ No implementado | El modelo `QuoteApproval` (decisión, snapshot, hash) existe en el schema pero **cero referencias** en `src/actions`, `src/app` o `src/components` — no está conectado a nada. Hoy una cotización cambia de estado, pero no hay token de aprobación del cliente ni registro de qué versión exacta aprobó. |
| Multi-techs and roles | ✅ Implementado | Roles `OWNER`/`MECHANIC`/`VIEWER` (`enum Role`), `TeamManagement.tsx` para invitar/gestionar equipo. Falta asignar un técnico a una orden de trabajo puntual — depende de que Work Orders exista; ya listado como alcance pendiente en `domain-model.md`. |
| Mobile friendly (shop floor ready) | ⚪ No verificado | Es una afirmación de diseño, no una función discreta. No se auditó la responsividad del panel admin en este ejercicio. |
| Multi-location support (plan Business) | ❌ No implementado | Un usuario pertenece como máximo a un taller (`reuse-audit.md`). `docs/product.md` lo excluye explícitamente: "múltiples sucursales por organización". |
| API access (pricing, ya etiquetado "coming soon") | ❌ No implementado | Consistente con su propia etiqueta — no es una promesa activa, no requiere acción. |
| "Get Started" / "Set up your shop in minutes. No credit card required." | ❌ No implementado | Solo existe login (`/admin/login`). Crear un taller nuevo es una acción de `SUPER_ADMIN` (`createShop` en `src/actions/platform.ts`), no un flujo público de alta. Todos los botones "Get Started" del homepage apuntan a `/admin/login`, que rechaza a cualquiera sin cuenta ya creada. |
| Planes de precio / cobro por suscripción | ❌ No implementado | No hay ningún proveedor de pagos (Stripe u otro) para cobrarle al taller — el `CARD`/`CASH` de facturas es el taller cobrándole a *su* cliente, algo distinto. `docs/roadmap.md` punto 6 ya lo pospone explícitamente: "Suscripciones y despliegue llegan después". |

## Lo que falta, sin rodeos

1. **Work Orders no existe como función usable** — es la brecha más grande entre lo prometido y lo real; aparece dos veces en el homepage (feature strip y checklist) y en el mockup del dashboard.
2. **Flujo de aprobación de cotizaciones** — el modelo está pero no hay nada que lo use.
3. **Inventario/partes** — cero, y ya estaba marcado fuera de alcance antes de que el homepage lo prometiera.
4. **Alta de cuenta pública (signup) y cobro por suscripción** — no existen; todo "Get Started" hoy es un callejón sin salida para un visitante nuevo.
5. **Multi-sucursal** — no existe y sigue fuera de alcance según `docs/product.md`.
6. **Sección de Reportes propia** — hoy es solo lo que ya trae el dashboard.
7. **Aislamiento multi-taller (seguridad)** — no es una promesa del homepage, pero bloquea a todo lo anterior: `docs/domain-model.md` es explícito en que el schema heredado **no impide enlaces entre talleres** todavía. No tiene sentido abrir alta pública o cobro sin esto resuelto primero.

## Choques con decisiones ya tomadas (para decidir, no para que yo lo resuelva solo)

`docs/product.md` ya había excluido explícitamente **inventario avanzado** y
**múltiples sucursales por organización** de la V1. El homepage que acabamos
de construir promete ambas cosas de todos modos (siguiendo el mockup de
referencia que nos diste). Hay dos salidas, no una — falta decidir cuál:

- Construir una versión mínima de cada una antes de lanzar el homepage tal
  cual está, o
- Suavizar/quitar esas líneas del homepage mientras no existan.

## Plan de construcción unificado (homepage + `docs/roadmap.md`)

Retoma la secuencia de `docs/roadmap.md` ("Próximas entregas") y le inserta
lo que este documento encontró. El orden es por dependencia real, no por
importancia de marketing.

0. **Aislamiento multi-taller.** Ya era el punto 1 del roadmap y sigue sin
   empezar. Bloquea todo lo demás si se piensa exponer con datos reales.
1. **Work Orders de punta a punta.** `src/actions/work-orders.ts` +
   pantallas en `src/app/admin/(shop)/work-orders/**`, usando
   `canTransitionWorkOrder` como ya existe. Vincular con cita y con
   técnico asignado (ambos ya señalados como alcance pendiente en
   `domain-model.md`).
2. **Aprobación de cotización.** Conectar `QuoteApproval`: token de un solo
   uso, snapshot del documento exacto, vencimiento. Roadmap punto 3.
3. **Folios atómicos + impuestos normalizados.** Roadmap punto 4,
   invariantes 5–6 de `domain-model.md`.
4. **Agenda y comunicaciones.** Traslapes/DST en transacción, storage
   privado con enlaces temporales, outbox para email/SMS. Roadmap punto 5,
   invariantes 8–9.
5. **Decisión de producto: inventario y multi-sucursal.** Ver sección
   anterior — construir un MVP de cada uno o editar el homepage.
6. **Sección de Reportes.** Separarla del dashboard si se mantiene la
   promesa "Reports & Insights" como diferenciador propio.
7. **Alta pública (signup) + cobro por suscripción.** Requiere el punto 0
   resuelto primero. Roadmap punto 6 ("piloto y comercialización") ya
   apuntaba aquí, pero sin mencionar un flujo de alta público — agregarlo
   explícitamente si el homepage se queda con botones "Get Started"
   apuntando a un signup real en vez de al login.

Nada de esto reemplaza `docs/roadmap.md`, `docs/domain-model.md` ni
`docs/reuse-audit.md` — los complementa con la vista específica de qué
promete el homepage nuevo que el producto todavía no cumple.
