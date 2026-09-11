# Mapa de navegación: hoy vs. una vez cerrado el plan de construcción

Cruza `docs/feature-gap.md` (lo que falta) y `docs/roadmap.md` (el orden de
dependencia) contra la navegación real del panel (`src/components/layout/Sidebar.tsx`,
`src/lib/routes.ts`) para fijar **dónde vive cada cosa en el menú**, tanto lo
que ya existe como lo que se va a ir agregando. Este documento se actualiza
según se construya cada punto — no es una foto fija.

## Regla de fondo

Un ítem entra al riel de navegación solo cuando tiene una `action` +
pantalla real detrás (mismo criterio que `feature-gap.md`). Nada de íconos
que apunten a una sección vacía — eso fue exactamente el problema que
`feature-gap.md` encontró en el mockup del homepage ("Messages" sin nada
detrás, "Work Orders" como si ya existiera).

## Navegación actual (lo que se construye en este paso)

Riel de íconos, de arriba a abajo:

| # | Ítem | Ruta | Ícono | Estado |
| - | --- | --- | --- | --- |
| 1 | Dashboard | `/admin/dashboard` | `LayoutDashboard` | ✅ Construido |
| 2 | Citas | `/admin/appointments` | `Calendar` | ✅ Construido |
| 3 | Clientes | `/admin/clients` | `Users` | ✅ Construido (vehículos viven anidados en `clients/[id]/vehicles`) |
| 4 | Cotizaciones | `/admin/quotes` | `FileSpreadsheet` | ✅ Construido (aprobación de cliente: pendiente, ver abajo) |
| 5 | Facturas | `/admin/invoices` | `FileText` | ✅ Construido |
| 6 | Caja | `/admin/caja` | `Banknote` | ✅ Construido |
| 7 | Contabilidad | `/admin/accounting` | `FolderOpen` | ✅ Construido |
| 8 | Recordatorios | `/admin/reminders` | `Bell` | ✅ Construido |
| — | Configuración (pie del riel) | `/admin/settings` | `Settings` | ✅ Construido (incluye equipo/roles vía `TeamManagement`) |

El orden sigue el flujo de trabajo real del taller (agenda → cliente/vehículo
→ cotizar → facturar → cobrar/contabilizar → dar seguimiento), no orden
alfabético.

## Lo que se integra según se vaya construyendo (orden de `feature-gap.md`)

| Punto del plan | Cambio en el menú | Cuándo se agrega el ícono |
| --- | --- | --- |
| 0. Aislamiento multi-taller | Ninguno — es infraestructura, no pantalla | Nunca aparece en el menú |
| 1. Work Orders de punta a punta | **Nuevo ítem "Órdenes de trabajo"** (`/admin/work-orders`, ícono `Wrench`), entre Citas y Clientes — es el paso que conecta ambos | Cuando exista `src/actions/work-orders.ts` + pantallas reales, no antes |
| 2. Aprobación de cotización | Ninguno — es un estado/flujo dentro de "Cotizaciones" (token del cliente, no una sección nueva) | No aplica |
| 3. Folios atómicos + impuestos | Ninguno — cambio de backend en Facturas | No aplica |
| 4. Agenda y comunicaciones (invariantes de citas, outbox email/SMS) | Ninguno nuevo — sigue viviendo en "Citas" | No aplica |
| 5. Inventario/partes | **Decisión de producto pendiente** (ver `feature-gap.md`, sección de choques). Si se construye: nuevo ítem "Inventario" (`Package`), después de Clientes. Si se decide no construirlo, se quita la promesa del homepage en vez de fingir el ícono | Solo tras decidir, y solo si hay `actions` + pantalla reales |
| 6. Sección de Reportes | **Nuevo ítem "Reportes"** (`/admin/reports`, ícono `BarChart3`), después de Contabilidad — separa el análisis a fondo (filtros, exportación) de las métricas resumidas que ya trae el Dashboard | Cuando exista como pantalla propia, no solo gráficas embebidas |
| 7. Alta pública + cobro por suscripción | Ninguno en el riel del taller — vive en `/admin/login` → futuro `/admin/signup`, y la facturación del propio taller (a diferencia de Caja, que es el taller cobrándole a *su* cliente) iría dentro de Configuración, no como ítem de primer nivel | Tras resolver el punto 0 |

Deliberadamente **no** se agrega un ítem "Mensajes" aunque el mockup del
homepage lo mostraba — `feature-gap.md` ya lo marcó como promesa sin nada
detrás. Se agrega el día que haya mensajería/chat real conectado a una
`action`, no antes.

`Vehículos` como ítem de primer nivel (con ícono `Car` propio, en vez de
vivir anidado bajo Clientes) queda como candidato de UX una vez que exista
una pantalla `/admin/vehicles` con listado propio — hoy esa pantalla no
existe, solo el detalle por vehículo, así que no se eleva todavía para no
repetir el mismo error que "Work Orders" en el homepage.

## Dashboard: qué cambia y qué no

El dashboard actual (`src/app/admin/(shop)/dashboard/page.tsx`) ya está
orientado a métricas del negocio (ingresos, facturas, top clientes), no a
la agenda del día — al revés del mockup de referencia, que pone el
calendario como protagonista. Se mantiene así: el dashboard sigue siendo
principalmente financiero/operativo, y se le agrega un bloque compacto
"Agenda de hoy" (próximas citas del día, 3–4 filas) como un widget más
entre las tarjetas existentes — no como la sección principal.
