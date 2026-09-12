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

**Corte anterior de este documento:** commit `9f8c758`'s ancestor
(`36bc292`). Desde entonces se fusionaron ~15 PRs con trabajo real: Fases
1–3/5/7 de la Communications Platform (outbox, Inbox, Campañas, dominios de
email propios), aprobación de cotización por token/SMS, signup self-serve,
i18n ES/EN/FR del panel completo, y un rediseño del dashboard y la
navegación (riel de íconos + topbar responsive). Este corte re-audita cada
fila contra el código actual.

**Fuera de alcance de este documento:** cobro por suscripción del propio
GarageOS y sus *gates* (qué se bloquea sin pagar). Se está revisando en
paralelo en otra sesión — no se lista aquí para no pisarlo.

## Tabla: promesa del homepage → estado real

| Promesa (homepage) | Estado | Evidencia |
| --- | --- | --- |
| Appointments & Scheduling | ✅ Implementado | `src/actions/appointments.ts`, `src/app/admin/(shop)/appointments/**`, `src/lib/booking-slots.ts`, `/book/[slug]`. **Invariante 8 sigue sin cerrar**: `checkMechanicConflict` (`appointments.ts:210`) es un `findFirst` separado de la creación, no una transacción — dos reservas simultáneas para el mismo mecánico/horario todavía pueden colarse. DST no verificado. |
| Work Orders & Estimates | ⚠️ Engañoso — sin cambios | Sigue igual que el corte anterior: el modelo `WorkOrder`/`WorkOrderLine` y `canTransitionWorkOrder` (`src/domain/work-order.ts`) existen, pero **cero** `actions` y **cero** pantalla (`grep -rl "WorkOrder" src/actions src/app` no devuelve nada). No se puede crear, ver ni editar una orden de trabajo desde la UI. Sigue siendo la brecha más grande del homepage. |
| Invoicing & Payments | ✅ Implementado, con la misma advertencia fiscal de antes | `src/actions/invoices.ts` (pagos CARD/CASH/MIXED), PDF. **Folios NO son atómicos todavía** — `src/lib/invoice-number.ts` trae su propio comentario: *"asignador por búsqueda de máximo, no atómico... reemplazar por secuencia atómica antes de servir usuarios reales concurrentes"*. Dos facturas creadas en el mismo instante pueden competir por el mismo número. `taxRate` sigue combinado por documento, sin normalizar (invariante 5 de `domain-model.md`). |
| Customer Communication | ✅ Implementado — mejoró mucho | Ya no es solo email/SMS transaccional: hay Inbox real (`src/app/admin/(shop)/inbox/**`, `src/actions/inbox.ts`), Campañas (`.../campaigns/**`, `src/actions/campaigns.ts`), dominios de email propios por taller (`src/actions/domains.ts`, `DomainSettings.tsx`) y outbox con idempotencia (`src/lib/communications/outbox.ts`). El nav "Mensajes" que antes era una promesa vacía **ahora es el Inbox real**. Dos piezas siguen dormidas a propósito (`docs/communications-activation-todo.md`): email entrante (webhook de Resend responde 404 sin configurar) y aprovisionamiento de SMS por taller (función existe, nada la llama todavía). |
| Vehicle History & Records | ✅ Implementado | Sin cambios: `Client` → `Vehicle`, `clients/[id]/vehicles/**`. Vehículos sigue sin ser un ítem de primer nivel en el nav (ver `docs/navigation-map.md`). |
| Inventory & Parts | ❌ No implementado — sin cambios | Cero modelo en el schema (`PART` es solo un valor del enum `LineItemType`, no una entidad). Sigue prometido en el feature strip y en los planes Pro/Business del pricing. |
| Reports & Insights / Reports & analytics | ⚠️ Parcial — mejoró pero sigue sin ser propio | El dashboard se rediseñó como "command center" (`src/app/admin/(shop)/dashboard/page.tsx`) e incluye ahora un bloque compacto de "hoy" (`todayAppointments`), tal como se planeó en `docs/navigation-map.md`. Sigue sin existir una sección "Reportes" separada con filtros/exportación — no hay ruta `/admin/reports` ni entrada en `ADMIN` (`src/lib/routes.ts`). |
| Your Brand Everywhere / Branded emails & documents | ✅ Implementado | Sin cambios, y reforzado: ahora un taller puede tener su propio dominio de envío de email (`src/lib/domains/email.ts`), no solo logo/nombre en plantillas. |
| Online & in-person booking | ✅ Implementado | Sin cambios: `/book/[slug]` + `appointments/new`. |
| Estimates with approval flow | ✅ Implementado — cerrado desde el último corte | `src/actions/quote-approvals.ts` + `/quote/[token]` + `QuoteApprovalForm.tsx`. Token de un solo uso consumido dentro de un `$transaction` (`updateMany` con `approvalTokenConsumedAt: null` como guarda de concurrencia), snapshot exacto del documento y su hash guardados en `QuoteApproval`, vencimiento verificado. Esto era el modelo huérfano del corte anterior; ya está conectado de punta a punta, incluyendo envío del enlace por SMS (`QuoteSmsButton.tsx`). |
| Multi-techs and roles | ✅ Implementado, con el mismo pendiente de antes | Roles `OWNER`/`MECHANIC`/`VIEWER`, `TeamManagement.tsx`. `docs/communications-activation-todo.md` confirma que **MECHANIC/VIEWER siguen sin diferenciarse en permisos** — cualquier usuario del taller puede leer/responder Inbox y ver Campañas hoy. Asignar técnico a una orden de trabajo puntual sigue dependiendo de que Work Orders exista. |
| Mobile friendly (shop floor ready) | ⚪ Parcialmente verificado — mejoró | Ya no es solo una afirmación de diseño: el nav ahora tiene un drawer móvil real con foco atrapado y cierre por Escape (`Sidebar.tsx`), y el topbar colapsa la búsqueda a un ícono en pantallas chicas. No se auditó el resto de las pantallas del panel (formularios largos, tablas). |
| Multi-location support (plan Business) | ❌ No implementado — sin cambios | `User.shopId` sigue siendo una FK simple y opcional (`prisma/schema.prisma:63-81`); no hay modelo `Membership`. Un usuario pertenece como máximo a un taller. `docs/product.md` lo sigue excluyendo explícitamente de la V1. |
| "Get Started" / "Set up your shop in minutes. No credit card required." | ✅ Implementado, con un cabo suelto de UX | Ya existe alta pública real: `/admin/signup`, `SignupForm.tsx`, `POST /api/auth/signup` — valida, crea `Shop`+`OWNER` en una transacción, abre sesión. `docs/signup-audit.md` marca que la verificación en producción (contra la DB real de Vercel) seguía pendiente al momento de escribirse, aunque `docs/db-migrations.md` dice que las migraciones ya corren solas en cada deploy. **Cabo suelto**: los botones "Get Started" del homepage (`Hero.tsx`, `CTASection.tsx`, `MarketingHeader.tsx`, etc.) todavía apuntan todos a `/admin/login`, no a `/admin/signup` — el signup solo se llega desde el link "¿Nuevo en GarageOS? Crear cuenta" dentro del login. Funciona, pero es un clic de más que contradice el copy de "en minutos". |
| API access (pricing, ya etiquetado "coming soon") | ❌ No implementado | Sin cambios — consistente con su propia etiqueta. |

## Lo que falta, sin rodeos (re-priorizado)

1. **Work Orders no existe como función usable** — sigue siendo la brecha
   más grande; cero movimiento desde el corte anterior.
2. **Aislamiento multi-taller** — sigue sin empezar. `User.shopId` es una FK
   simple; no hay `Membership`, claves compuestas ni RLS. Bloquea servir
   datos reales de más de un taller con confianza.
3. **Folios de factura/cotización no son atómicos** — race condition real y
   documentada en el propio código (`invoice-number.ts`). Impuestos
   (`taxRate`) siguen sin normalizarse por documento.
4. **Reservas sin protección transaccional contra doble-booking** — el
   chequeo de conflicto de mecánico es de lectura separada, no atómico; DST
   sin probar.
5. **Inventario/partes** — cero, sigue fuera de alcance de `docs/product.md`.
6. **Multi-sucursal** — cero, sigue fuera de alcance de `docs/product.md`.
7. **Sección de Reportes propia** — el dashboard mejoró (bloque de agenda de
   hoy) pero sigue sin una pantalla de análisis separada.
8. **Piezas dormidas de Communications** — email entrante y aprovisionamiento
   de SMS por taller están escritas pero no activadas (ver
   `docs/communications-activation-todo.md` para los pasos exactos).
9. **Botones "Get Started" del homepage no llegan directo al signup real**
   — arreglo chico, alto impacto en conversión.
10. **Roles MECHANIC/VIEWER sin diferenciar permisos** — cualquiera del
    taller puede hoy leer Inbox y Campañas.

Ya **no** están en esta lista (resueltos desde el corte anterior):
aprobación de cotización end-to-end, mensajería/Inbox real, signup
self-serve, y la brecha original de "Reports" quedó reducida (el dashboard
ya no es solo financiero, tiene su bloque de agenda).

## Choques con decisiones ya tomadas (para decidir, no para que yo lo resuelva solo)

Sigue sin resolverse: `docs/product.md` excluye explícitamente
**inventario avanzado** y **múltiples sucursales por organización** de la
V1, pero el homepage las sigue prometiendo tal cual. Las dos salidas de
siempre, sin decidir todavía:

- Construir una versión mínima de cada una antes de lanzar el homepage tal
  cual está, o
- Suavizar/quitar esas líneas del homepage mientras no existan.

## Plan de construcción unificado (actualizado)

Orden por dependencia real, no por importancia de marketing. Se quita del
todo el punto de cobro por suscripción (se sigue en paralelo, fuera de este
documento).

0. **Aislamiento multi-taller.** Sin empezar. Bloquea todo lo demás si se
   piensa exponer con datos reales de más de un taller.
1. **Work Orders de punta a punta.** `src/actions/work-orders.ts` +
   pantallas en `src/app/admin/(shop)/work-orders/**`, usando
   `canTransitionWorkOrder` como ya existe. Vincular con cita y con técnico
   asignado.
2. **Folios atómicos + impuestos normalizados.** Reemplazar
   `allocateNextInvoiceNumber`/`allocateNextQuoteNumber` (búsqueda de
   máximo) por una secuencia atómica real por taller y tipo de documento.
3. **Transacción/lock en la reserva de citas.** Cerrar el hueco de
   doble-booking entre `checkMechanicConflict` y la creación real; probar
   DST.
4. **Arreglo rápido: enlazar "Get Started" al signup real.** Bajo esfuerzo,
   cierra una promesa de homepage que hoy funciona pero con fricción extra.
5. **Activar las piezas dormidas de Communications** (opcional, no
   bloqueante): email entrante y SMS por taller, siguiendo
   `docs/communications-activation-todo.md`.
6. **Decisión de producto: inventario y multi-sucursal.** Ver sección
   anterior — construir un MVP mínimo de cada uno o editar el homepage.
7. **Sección de Reportes propia.** Separarla del dashboard si se mantiene
   la promesa "Reports & Insights" como diferenciador propio.
8. **Diferenciar permisos MECHANIC/VIEWER** para Inbox/Campañas, y en
   general para lo que se vaya agregando.

Nada de esto reemplaza `docs/roadmap.md`, `docs/domain-model.md`,
`docs/reuse-audit.md`, `docs/communications-platform.md` ni
`docs/navigation-map.md` — los complementa con la vista específica de qué
promete el homepage que el producto todavía no cumple, a la fecha de este
corte.
