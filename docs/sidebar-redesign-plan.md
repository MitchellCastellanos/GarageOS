# Rediseño del riel de navegación de `/admin` (icon rail)

Este documento junta lo acordado en sesión sobre cómo reorganizar visualmente
el riel de íconos del admin (`src/components/layout/Sidebar.tsx`), sin volver
a caer en "apilado + scroll nativo feo". No se implementó nada de esto
todavía — es el punto de partida para la siguiente sesión.

## Contexto: cómo llegamos aquí

1. El riel original era una lista plana de ítems, uno debajo del otro.
2. Se agrupó en 4 categorías (ver abajo) con separadores — esto se agregó en
   un commit paralelo (`07d4323`, "Reorganize admin dashboard and sidebar")
   mientras se trabajaba en otra cosa en esta misma sesión.
3. Con las categorías agrupadas, en pantallas de poca altura el riel sigue
   sin caber completo → se vuelve scrolleable. Se arregló el bug técnico
   (faltaba `min-h-0`, sin eso el navegador metía su scrollbar nativa fea en
   vez de un scroll contenido — PR #52, ya mergeado a `main`).
4. Feedback del usuario tras ver el resultado: **las categorías le gustaron,
   pero seguir viéndolas apiladas con scroll "sigue siendo culero"**. Pidió
   ideas creativas para reemplazar el layout apilado+scroll por algo mejor,
   sin descartar animaciones llamativas (ejemplo suyo: "como un disco que
   gira con las opciones de cada categoría").

## Categorías y sub-ítems actuales (punto de partida, no tocar el contenido)

Definidas en `Sidebar.tsx` (`navGroups`), mismas 4 categorías que el grid de
"módulos" del dashboard:

| Categoría | Sub-ítems (orden actual) |
| --- | --- |
| **Operaciones** (`t.navGroups.operations`) | Citas (`Calendar`) · Órdenes de trabajo (`Wrench`) · Inspecciones (`ClipboardCheck`) · Cotizaciones (`FileSpreadsheet`) · Recordatorios (`Bell`) |
| **Clientes** (`t.navGroups.customers`) | Clientes (`Users`) · Facturas (`FileText`) · Contabilidad (`FolderOpen`) |
| **Comunicación** (`t.navGroups.communications`) | Inbox (`Inbox`) · Campañas (`Megaphone`) |
| **Finanzas** (`t.navGroups.finance`) | Caja (`Banknote`) · Inventario (`Package`) |

Fuera de las categorías (fijos):
- Arriba de todo: Dashboard (`LayoutDashboard`, sin categoría).
- Abajo, pie del riel (siempre visible, no debe scrollear nunca): Soporte
  (`LifeBuoy`) y Configuración (`Settings`).

Puntos "en vivo" (dots rojos) ya implementados vía Pusher, deben conservarse
sea cual sea el layout nuevo:
- Inbox: `hasUnreadInbox` / `liveInbox` (canal `staff-notifications-{userId}`).
- Citas: `hasUnreadAppointments` / `liveAppointments` (mismo canal).
- Soporte: `hasUnreadSupport` (respuesta de GarageOS sin leer).
- Ítems bloqueados por plan (`locked`): candado ámbar, ver `lockedNavHrefs`.

## Restricciones técnicas a respetar en cualquier propuesta

- El riel mide `w-[72px]` fijo en desktop — cualquier expansión (flyout,
  panel, dial) tiene que salir *fuera* de esa franja, no ensancharla, porque
  empujaría el contenido principal.
- El drawer mobile (`motion.aside` con `MobileNavLink`) es un componente
  aparte y **ya funciona bien** (drawer full con labels, sin scroll roto) —
  el rediseño es solo para el riel de escritorio (`RailLink`/`md:flex`).
- Los tooltips de `RailLink` se renderizan por `createPortal` a
  `document.body` con posición `fixed` calculada del `getBoundingClientRect()`
  del ícono (PR #52) — cualquier rediseño que cambie dónde/cómo se posicionan
  los íconos debe recalcular o reemplazar esta lógica, no asumir que el
  tooltip actual sigue funcionando igual.
- Accesibilidad: hoy cada `RailLink` tiene `aria-label`; el drawer mobile
  atrapa foco y cierra con Escape. Lo que sea que se construya debe seguir
  siendo operable con teclado (no solo hover/mouse) y no debe romper el
  `aria-label`/foco existente.
- Lint del repo usa `react-hooks` con reglas estrictas ya chocadas antes en
  este archivo: `react-hooks/set-state-in-effect` (no `setState` síncrono
  dentro de un `useEffect`) y `react-hooks/refs` (no leer/escribir un `ref`
  durante el render). Cualquier estado de "categoría abierta" / animación
  debe diseñarse con eso en mente desde el inicio.

## Las 5 ideas propuestas (sin prototipar todavía)

1. **Acordeón de categorías (colapsable).** Solo se ven los 4 íconos de
   categoría en reposo; al tocar uno se expande empujando a los demás
   (Framer Motion `layout`), mostrando sus sub-íconos; solo una categoría
   abierta a la vez. Nunca hay overflow porque el riel nunca crece más que
   una categoría expandida a la vez.
2. **Rueda/dial tipo iPod ("disco que gira").** Las categorías viven en un
   dial circular arriba del riel; al activarlas, gira y despliega los
   sub-ítems en arco alrededor del centro (menú radial estilo FAB). Es la
   más vistosa, pero la más riesgosa en mobile/touch y en cálculo de
   posiciones.
3. **Flyout lateral por categoría (mega-tooltip).** El riel muestra solo los
   4 íconos de categoría, nunca sub-ítems en el riel mismo. Hover/click abre
   un panel flotante a la derecha (evolución del tooltip actual) con los
   sub-ítems en lista o grid. Layout del riel siempre de tamaño fijo → cero
   scroll garantizado. Es la opción más simple de implementar bien.
4. **Dos columnas (categoría fija + sub-riel dinámico).** Columna izquierda
   fija con las 4 categorías; columna derecha aparece solo al seleccionar una
   categoría, con sus sub-íconos, animada con slide horizontal. Se siente
   más "explorador de archivos" en miniatura.
5. **Carrusel vertical paginado con puntos (tipo stories).** Los ítems se
   agrupan en "páginas" dimensionadas para caber exactas en la pantalla
   disponible; los íconos de categoría funcionan como paginador (dots estilo
   Instagram Stories) debajo del riel; swipe/click anima con slide o fade.

## Cómo se dejó la sesión

- No se prototipó ninguna de las 5 ideas todavía — el usuario quiere probar
  varias en preview antes de decidir, y prefirió no saturar esta sesión.
- No hay decisión tomada sobre cuál implementar. La recomendación dada en
  chat fue: **opción 3 (flyout lateral)** como la más rápida de hacer bien,
  y **opción 2 (dial)** como la más llamativa si se quiere apostar por algo
  más "wow", con más riesgo de UX/tiempo.
- Próximo paso sugerido: en la próxima sesión, prototipar 1–2 opciones en un
  branch de preview (Vercel preview deploy) antes de comprometerse a una,
  usando este documento como fuente de verdad de categorías/sub-ítems y
  restricciones técnicas.
