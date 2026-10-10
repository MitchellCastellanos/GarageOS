# Auditoría de Resources vs. producto real (2026-10-10)

Alcance: todo lo público bajo Resources (`/help`, `/quick-start`, `/guides`, `/blog`, `/changelog`, `/demo`, `/get-started`) y las páginas que describen funciones (`/features`, `/product`, `/integrations`, `/pricing`), contrastado contra el código (`src/config/entitlements.ts`, `src/domain/permissions.ts`, `Sidebar.tsx`, settings, `prisma/schema.prisma`, crons, dictionaries ES/EN/FR).
Método: lectura de código, sin ejecutar la app. Lo marcado **(verificar)** no se pudo confirmar leyendo.

Fuentes de contenido: `src/lib/marketing-resources.ts` (12 guías + 3 posts), `src/app/help/page.tsx` (14 FAQ EN/FR), `src/lib/marketing-flow.ts` (Get Started / Demo / Quick Start), `src/lib/marketing-pages.ts` (Features / Product / Integrations), `src/lib/marketing-plans.ts` (Pricing), `src/app/changelog/page.tsx`.

---

## 1. Resumen ejecutivo

- El contenido existente es **mayormente correcto** para el flujo base (reservar → inspeccionar → cotizar → aprobar → orden → factura → recordatorio). Los límites de importación, vigencia del portal (30 días, 5 enlaces), precios, trial de 14 días y gates de plan coinciden con el código.
- El problema principal no es información falsa, es **cobertura**: el producto tiene ~15 áreas con pantalla propia que no tienen ninguna guía, y el Help Center es una lista plana sin búsqueda.
- Lo más desfasado: guía de comunicaciones apunta a la pestaña equivocada, terminología Quotes/Estimates distinta a la del panel, Changelog que no es changelog, guías/blog solo en inglés, y dos docs internos obsoletos.

---

## 2. Navegación y estructura (para que sea "fácil de navegar")

| # | Hallazgo | Evidencia |
|---|----------|-----------|
| N1 | **No hay búsqueda** en Help ni en Guides. 12 guías + 14 FAQ en una sola página. | `help/page.tsx`: guías agrupadas + `<details>` planos |
| N2 | **Guías y Blog solo en inglés** (`<div lang="en">`, contenido sin versión FR). Help, Quick Start, Changelog, Get Started sí son EN/FR, y el panel es ES/EN/FR. Un visitante francófono entra por el toggle y cae en inglés. | `guides/page.tsx`, `blog/page.tsx`, `ResourceArticles.tsx` (texto fijo en inglés) |
| N3 | El menú Resources solo tiene 5 enlaces (Help, Quick Start, Guides, Blog, Changelog). Demo e Integrations solo están en el footer; **los videos (`/watch/[lang]`, EN/FR) no están enlazados desde ningún recurso**. | `marketing-locale.ts` `resourcesMenu` |
| N4 | **No hay `sitemap.ts` ni `robots.ts`** (`src/app/` no los tiene). Para un sitio que quiere más "help", es SEO/descubrimiento perdido. | `ls src/app` |
| N5 | Las guías no tienen navegación entre sí (anterior/siguiente), ni "guías relacionadas", ni nivel de plan visible, ni tiempo de lectura, ni "última actualización". Solo el post de blog enlaza una guía. | `ResourceArticleBody` |
| N6 | **Ayuda dentro del panel desconectada de resources**: el ítem "Help" del sidebar (`/admin/support`) es solo chat con el equipo GarageOS; su diccionario no enlaza guías ni el Help Center. Tampoco hay ayuda contextual (enlace "?" por pantalla). | `admin-locale/support.ts`, `support/page.tsx` |
| N7 | El Help Center solo ofrece un canal de salida: correo (`/contact`). No menciona el chat in-app. | `help/page.tsx`, `contact/page.tsx` |
| N8 | Quick Start público (13 pasos, `marketing-flow.ts`) y onboarding in-app (`/admin/onboarding`, 6 pasos + plan) son listas distintas, sin sincronizar. **(verificar contenido de pasos)** | `admin-locale/onboarding.ts` |
| N9 | Mapa interno `docs/navigation-map.md` está obsoleto (ver D2). | — |

---

## 3. Contenido incorrecto o desfasado

### Correcciones concretas (alto)

| # | Dónde | Problema | Real |
|---|-------|----------|------|
| C1 | Guía `branded-communications` | Dice "Open **Notifications** in settings" para buzones, dominio y ruteo. | Eso vive en la pestaña **Domain / Dominio y Email** (`id: "domain"`: dominio, identidades de remitente, rutas). La pestaña **Notifications** contiene otra cosa: número SMS, alertas al staff, recordatorios de citas, aviso "Ready for pickup". Hay que reescribir la guía y crear una para Notifications. |
| C2 | Todas las guías, Quick Start, FAQ | Usan "**Estimates**" / "Open Estimates". | El panel EN dice **"Quotes"** (FR: "Soumissions"). Quien siga la guía no encuentra "Estimates" en el menú. Unificar (recomendado: usar "Quotes" en EN, o renombrar el panel; decidir una). También "Work Orders" (guías) vs "Work orders" (panel) y "Inbox"/"Boîte de réception". |
| C3 | Changelog | Menú dice "Changelog / Nouveautés" pero la página se titula "What's in GarageOS" y **no tiene fechas ni versiones**; nada de lo entregado en las últimas semanas. | Renombrar a "What's new" con entradas fechadas, o dejar "Product overview" y quitarlo del menú. |
| C4 | Product page (`PRODUCT_COPY`), Features | "Owners and **front desk** get the full workflow, mechanics get what's relevant". | No existe rol de front desk. Roles reales: `OWNER`, `MECHANIC`, `VIEWER`. El mostrador usa `MECHANIC`, que opera todo el flujo (incluye facturar y cobrar) pero **no** ve contabilidad/reportes, no envía campañas, no importa, no toca configuración. Reembolsos: solo dueño por defecto. Hay que documentar la matriz real. |
| C5 | Pricing / Features / FAQ | "A monthly SMS allowance is included" sin cifras ni excedente. | Código: Core 300 / Pro 1,000 / Complete 2,500 segmentos/mes; **el excedente se factura** (medidor Stripe `sms_overage_segments`). El propio código marca las cifras como **provisionales**. Decisión de negocio antes de publicar (ver §6). |
| C6 | Guía `set-up-your-shop` / FAQ | No menciona el límite de **3 usuarios en Core** al invitar equipo. | `PLAN_LIMITS.CORE.users = 3`. Añadir a guía y a FAQ. |

### Menores / estilo

- Get Started y Help dicen "choose your plan and add payment method"; correcto, pero no explican qué pasa **al terminar el trial / pago fallido / cancelar** (estados `TRIALING`, `PAST_DUE`, `UNPAID`, `CANCELED`; banner de suscripción existe en el panel). FAQ "Can I change plans" es de una línea.
- Guía `maintenance-reminders` documenta recordatorios de servicio (cron diario 8:00, 7 días antes en Core); **no** documenta recordatorios de **citas** (configurables por horas, por defecto 24 h, SMS principal con respaldo por email) ni los de **recogida de llantas**.
- Guía `customer-portal` no cubre las otras páginas públicas que ve el cliente: aprobación de cotización (`/quote/[token]`, vence a 30 días), confirmar/cancelar cita (`manageToken`, solo citas futuras SCHEDULED/CONFIRMED), reporte de inspección compartido (`/inspection/[token]`), página de reservas.
- FAQ no cubre: Google sign-in (existe en `auth.ts` y se menciona en Get Started), recuperación de contraseña, verificación de correo, idioma del panel vs idioma del cliente (ES/EN/FR; el hint del panel aclara que no afecta a los clientes).
- Blog: 3 posts genéricos, sin fecha/autor, sin FR. Aportan poco como "help".

---

## 4. Funciones del producto sin ningún contenido de ayuda

Prioridad **P1** = uso diario o genera tickets; **P2** = avanzado.

| Prio | Función (ruta / pestaña) | Plan | Qué existe hoy en resources |
|------|--------------------------|------|------------------------------|
| P1 | **Página de reservas: diseñador** (Settings → Booking page): fotos, plantillas Classic/Modern/Bold/Minimal, tipografías, íconos de servicio, servicios destacados, QR, snippet para incrustar | Classic gratis; resto Pro | Una fila en pricing y una mención en Features. Cero guía. (`docs/booking-page-customization-plan.md` interno.) |
| P1 | **Dominio y correo propio** (Settings → Domain): subdominio, dominio personalizado, verificación DNS, identidades de remitente, rutas | Pro | Mal ubicado (C1). Sin pasos de DNS ni troubleshooting. |
| P1 | **Notificaciones** (Settings → Notifications): número SMS, alertas al staff (campana + tiempo real), recordatorios de cita, aviso Ready for pickup | Todos | Nada. |
| P1 | **Inbox** (`/admin/inbox`): correo y SMS bidireccional, STOP, hilos | Todos | Se menciona en Features; sin guía. |
| P1 | **Equipo, roles y permisos** (Settings → Team) | Roles todos; permisos finos Pro | Una frase en guía de setup. Falta la matriz de permisos. |
| P1 | **Facturación y plan** (Settings → Billing): cambiar plan, tarjeta, cancelar, qué pasa si falla el pago | Todos | Una línea en FAQ. |
| P1 | **Pagos y reembolsos** | Todos | Solo "record payment". Falta métodos, reembolso parcial/total, quién puede reembolsar, impuestos fijados por factura. |
| P1 | **Catálogo de servicios, líneas guardadas, impuestos** (Settings → Services, `saved-line-items`, `tax-presets`) | Todos | Quick Start lo cita como paso; sin guía. |
| P1 | **Caja / Cash drawer** (`/admin/caja`) | Todos | Una línea en Features. |
| P2 | **Reportes** (resumen vs avanzados, rangos, CSV) | Resumen todos; avanzados Pro | Una línea en Features. |
| P2 | **Contabilidad Light** (resúmenes TPS/TVQ, bitácora, exports) | Pro | Una línea en Features. |
| P2 | **QuickBooks Online**: conexión, fecha de inicio, qué se sincroniza, errores | Pro | Existe `docs/quickbooks-setup.md` interno; no hay versión pública. |
| P2 | **Campañas** (segmentos, consentimiento CASL, prueba, programación) | Pro | Una línea en Features. |
| P2 | **Almacén de llantas** (entrada/salida, ubicación, aviso de recogida) | Pro | Una línea en Features. |
| P2 | **Plantillas de inspección** (`/admin/inspections/templates`) | Pro | Mencionadas dentro de la guía DVI, sin pasos. |
| P2 | **Página de vehículo** (`/admin/vehicles/[id]`), **búsqueda global**, **dashboard**, **cambio de idioma** | Todos | Nada. |
| P2 | **Multi-Shop** | Complete | Cubierto (guía `multi-location`). |
| P2 | **Importar datos** | Todos/Pro | Cubierto (guía `import-your-data`). |

Cubiertos y vigentes: set-up-your-shop (salvo C6), configure-online-booking, clients-and-vehicles, estimate-to-invoice (salvo C2), approval-history, maintenance-reminders (salvo menores), manage-inventory, multi-location, digital-vehicle-inspections, work-orders, customer-portal, import-your-data.

### Faltan secciones transversales
- **Troubleshooting**: SMS no sale/STOP, verificación de dominio, sincronización QuickBooks, "no veo X" (rol/plan/ubicación), horarios que no aparecen.
- **Glosario**: Quote vs Estimate, estado de orden (`WorkOrderStatus`) vs estado del trabajo (`JobStatus`), estados de factura/cotización/cita.
- **Privacidad y cumplimiento para talleres**: consentimiento CASL, STOP, retención, Ley 25 (hay material en `docs/compliance/`, nada público además de Privacy/Terms).
- **Planes**: tabla "qué plan necesito para…" enlazada desde cada guía con insignia Pro/Complete (ya existe `itemMinPlan`/`PLAN_BADGE` en `marketing-pages.ts`, reutilizable).

---

## 5. Docs internos obsoletos

| # | Archivo | Problema |
|---|---------|----------|
| D1 | `docs/marketing-resources-audit.md` | Describe 4 guías, 10 preguntas y una integración con "Google Drive"; hoy hay 12 guías, 14 FAQ y Google Drive no aparece en el código. Reemplazar por este documento. |
| D2 | `docs/navigation-map.md` | Lista `/admin/notifications` como ítem de menú (el sidebar actual no lo tiene; vive en Settings), trata Work Orders y Reports como "pendientes" (ya construidos y en el menú), y omite Tire storage, Import, Organization e Inspections. |
| D3 | `docs/public-product-surface-gap.md`, `docs/public-site-refresh-implementation.md` | No revisados a fondo **(verificar)**; pueden contradecir el estado actual. |

---

## 6. Decisiones que necesitamos antes de escribir

1. **Terminología**: ¿"Quotes" o "Estimates" en EN (y alinear FR/ES)? Afecta guías, FAQ, pricing, emails y panel.
2. **Cifras de SMS**: ¿se publican los 300/1,000/2,500 y el precio de excedente, o se mantienen "provisionales" fuera de la web?
3. **Idiomas de las guías**: ¿EN+FR obligatorio (recomendado, el producto es bilingüe en Quebec) y ES para el panel?
4. **Changelog**: ¿entradas fechadas desde ahora (requiere disciplina de release) o renombrar a "Producto"?
5. **Rol "front desk"**: ¿se documenta como MECHANIC con permisos de mostrador, o se crea un rol propio?

---

## 7. Propuesta de estructura nueva

```
/help                       Buscador + "Empezar" + categorías + preguntas populares + contacto/chat
  /help/getting-started     Cuenta, trial, quick start, importar, equipo
  /help/appointments        Reservas, diseñador, recordatorios, links del cliente
  /help/jobs                Inspecciones, cotizaciones, órdenes, inventario, llantas
  /help/billing-customers   Facturas, pagos, reembolsos, portal, caja
  /help/communications      Inbox, SMS, dominio/correo, campañas, notificaciones
  /help/reports-books       Reportes, contabilidad, QuickBooks
  /help/account             Equipo y permisos, plan y facturación, multi-shop, idioma
  /help/troubleshooting     Problemas comunes
  /help/glossary            Glosario
/guides/[slug]              Cada guía: insignia de plan, tiempo, "relacionadas", anterior/siguiente, video
/quick-start                Misma lista que el onboarding in-app (una sola fuente)
/whats-new                  Changelog fechado (EN/FR)
```

Reglas de implementación sugeridas:
- Mover guías a datos bilingües (`Localized`) con el mismo patrón que `marketing-pages.ts`, y un test (como `tests/public-surface.test.ts`) que falle si una guía referencia una pestaña/ruta inexistente o un gate de plan que no coincide con `CAPABILITY_MIN_PLAN`.
- Enlace "?" contextual en cada pantalla del panel hacia su guía, y enlace al Help Center desde `/admin/support`.
- Agregar `sitemap.ts`/`robots.ts`, incluir `/watch` y videos en Resources.

## 8. Orden de trabajo recomendado

1. Decisiones de §6.
2. Correcciones C1–C6 + terminología (rápido, bajo riesgo).
3. Estructura y búsqueda del Help Center + guías bilingües + sitemap.
4. Guías P1 (8–9 artículos) y FAQ/troubleshooting.
5. Guías P2, glosario, changelog fechado, videos incrustados.
6. Retirar/actualizar docs internos D1–D3.
