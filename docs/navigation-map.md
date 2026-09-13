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

## Navegación actual (`src/components/layout/Sidebar.tsx`, corte post-Communications Platform)

El riel creció desde el mapeo original — la Communications Platform (Fases
1–3/5/7, ver `docs/feature-gap.md`) agregó Inbox y Campañas como pantallas
reales, no como promesas:

| # | Ítem | Ruta | Ícono | Estado |
| - | --- | --- | --- | --- |
| 1 | Dashboard | `/admin/dashboard` | `LayoutDashboard` | ✅ Construido (incluye bloque "hoy" de citas) |
| 2 | Inbox | `/admin/inbox` | `Inbox` | ✅ Construido — reemplaza lo que iba a ser el "Mensajes" fantasma del homepage |
| 3 | Citas | `/admin/appointments` | `Calendar` | ✅ Construido (doble-booking ya blindado con transacción `Serializable`, ver `feature-gap.md`) |
| 4 | Clientes | `/admin/clients` | `Users` | ✅ Construido (vehículos siguen anidados en `clients/[id]/vehicles`) |
| 5 | Cotizaciones | `/admin/quotes` | `FileSpreadsheet` | ✅ Construido — aprobación de cliente por token/SMS ya conectada (`quote-approvals.ts`, `/quote/[token]`) |
| 6 | Facturas | `/admin/invoices` | `FileText` | ✅ Construido (folios atómicos vía `DocumentSequence`) |
| 7 | Inventario | `/admin/inventory` | `Package` | ✅ Construido — lista, alta, detalle con ajuste de stock e historial |
| 8 | Campañas | `/admin/campaigns` | `Megaphone` | ✅ Construido |
| 9 | Notificaciones | `/admin/notifications` | `Mail` | ✅ Construido — solo visible para `OWNER` |
| 10 | Caja | `/admin/caja` | `Banknote` | ✅ Construido |
| 11 | Contabilidad | `/admin/accounting` | `FolderOpen` | ✅ Construido |
| 12 | Recordatorios | `/admin/reminders` | `Bell` | ✅ Construido |
| — | Configuración (pie del riel) | `/admin/settings` | `Settings` | ✅ Construido (equipo/roles, **Ubicaciones** para multi-sucursal, dominios de email, idioma) |
| — | Selector de ubicación (menú de usuario del topbar) | — | `MapPin` | ✅ Construido — solo aparece si el usuario tiene acceso a más de una ubicación |

El riel ahora también tiene versión móvil (drawer con foco atrapado,
`Sidebar.tsx`) y el topbar colapsa el buscador a un ícono en pantallas
chicas — el mapeo original solo cubría desktop.

El orden sigue el flujo de trabajo real del taller (bandeja/agenda →
cliente/vehículo → cotizar → facturar/cobrar → comunicación saliente →
contabilidad → seguimiento), no orden alfabético.

## Lo que falta por integrar (orden de `feature-gap.md`)

Una sola tarea grande pendiente en cuanto a navegación:

| Punto del plan | Cambio en el menú | Cuándo se agrega el ícono |
| --- | --- | --- |
| Work Orders de punta a punta | **Nuevo ítem "Órdenes de trabajo"** (`/admin/work-orders`, ícono `Wrench`), entre Citas y Clientes — es el paso que conecta ambos | Cuando exista `src/actions/work-orders.ts` + pantallas reales, no antes |
| Sección de Reportes | **Nuevo ítem "Reportes"** (`/admin/reports`, ícono `BarChart3`), después de Contabilidad — separa el análisis a fondo (filtros, exportación) de las métricas resumidas que ya trae el Dashboard | Cuando exista como pantalla propia, no solo gráficas embebidas |

Todo lo demás del plan (folios atómicos, transacción en reservas, activar
piezas dormidas de Communications, permisos MECHANIC/VIEWER) es backend o
configuración — no agrega ni cambia ítems del menú.

Resuelto desde el mapeo original: **Aprobación de cotización** no necesitó
ítem de menú propio — quedó, como se previó, dentro del flujo de
"Cotizaciones" (token del cliente en `/quote/[token]`, sin pantalla nueva
en el admin). **"Mensajes"** ya no es una promesa vacía: es el Inbox real.
**Inventario** ya tiene su ítem propio en el riel (tabla de arriba).
**Multi-sucursal** no necesitó un ítem de primer nivel dedicado — vive como
pestaña "Ubicaciones" en Configuración (gestión) más el selector de
ubicación en el menú de usuario del topbar (uso diario), consistente con
cómo ya vivía Equipo/roles.

Cobro por suscripción del propio GarageOS queda fuera de este documento —
se está decidiendo en paralelo en otra sesión.

`Vehículos` como ítem de primer nivel (con ícono `Car` propio, en vez de
vivir anidado bajo Clientes) queda como candidato de UX una vez que exista
una pantalla `/admin/vehicles` con listado propio — hoy esa pantalla no
existe, solo el detalle por vehículo, así que no se eleva todavía para no
repetir el mismo error que "Work Orders" en el homepage.

## Dashboard: qué cambió

Resuelto. El dashboard se rediseñó como "command center"
(`src/app/admin/(shop)/dashboard/page.tsx`): sigue siendo principalmente
financiero/operativo (ingresos, facturas, top clientes) y ahora incluye el
bloque compacto de "hoy" (`todayAppointments`) que este documento pedía —
sin volverse el centro del dashboard, tal como se planeó.
