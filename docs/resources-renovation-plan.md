# Plan técnico y editorial — Renovación de Resources y Help Center

Estado: **PROPUESTA PARA APROBACIÓN. No se ha implementado nada.**
Fecha: 2026-10-10 · Base verificada: `origin/main` @ `891f5ae` (PR #97) · Parte de: `docs/resources-audit-2026-10.md`

> Corrección a la auditoría previa: hay **13 guías** (no 12) y 3 posts de blog; la FAQ tiene 14 preguntas por idioma. Lo demás se mantiene.

Leyenda: **[V]** verificado en código · **[?]** no verificable leyendo código; se confirma en Fase 1 · **[D]** requiere decisión tuya.

---

## 0. Qué cambió en `main` desde la auditoría

`main` solo avanzó con PR #97 (Field Route Planner del CRM de ventas) y docs de Lead Engine/CASL de ventas. **Nada de eso es público ni afecta Resources**; queda excluido por la regla de separación de públicos (§8). La rama `claude/resources-audit-2026-10` partió de `be0dfe7` y quedó detrás de `main` (HEAD local no es fast-forward porque tiene el commit de la auditoría).

**Propuesta de rama:** crear `claude/resources-renovation` desde `origin/main`, traer la auditoría y este plan con cherry-pick, y trabajar ahí. La rama de auditoría se conserva sin tocar. Sin commits a `main`, sin merge, sin deploy.

---

## 1. Diagnóstico

### 1.1 Lo que existe [V]

| Pieza | Estado actual |
|---|---|
| `/help` | 13 guías agrupadas + 14 FAQ (EN/FR), sin búsqueda |
| `/guides`, `/guides/[slug]` | 13 guías **solo en inglés** (`<div lang="en">`), contenido en `src/lib/marketing-resources.ts` |
| `/blog`, `/blog/[slug]` | 3 posts, solo EN, sin fecha ni autor |
| `/quick-start` | 13 pasos EN/FR (`marketing-flow.ts`), distinto del onboarding in-app |
| `/changelog` | Resumen atemporal "What's in GarageOS", sin fechas |
| `/features`, `/product`, `/integrations`, `/pricing`, `/get-started`, `/demo` | EN/FR vía diccionarios (`marketing-pages.ts`, `marketing-plans.ts`, `marketing-flow.ts`) |
| `/watch/[lang]` (+ `/teaser`) | Video comercial 60 s y teaser 15 s EN/FR, con hreflang y `VideoObject`; MP4 desde CDN, nunca desde Vercel |
| `/demo` | Recorrido visual "Garage Laurent" con 23 capturas webp por idioma (≈6 MB) — **es una demostración comercial, no un tutorial** |
| Tests | `tests/public-surface.test.ts` ya protege precios, gates de plan, paridad EN/FR y enlaces demo→guías |

### 1.2 Hallazgos estructurales nuevos (más graves que el contenido) [V]

1. **El idioma es solo del cliente.** `MarketingLocaleProvider` lee `localStorage`/`navigator.language` tras hidratar. Hay **una sola URL por página**: el HTML que ve Google es siempre inglés y `<html lang="en">`. El francés **no es indexable hoy**, no hay hreflang posible y un enlace compartido en francés abre en inglés. Esto es lo que hay que arreglar primero: sin URLs por idioma no se puede cumplir "no mostrar inglés bajo una ruta francesa" ni el SEO FR.
2. **Canonical heredado.** `src/app/layout.tsx` fija `alternates.canonical = getAppUrl()` para todo el sitio. Por herencia de metadata de Next, cualquier página que no defina su propio `alternates` declara como canónica la home. Es probable que `/help`, `/guides/*`, `/blog/*`, etc. estén diciendo a Google "mi original es la home". **[?]** confirmar en el HTML renderizado en Fase 1; si se confirma, es un fix de una línea que conviene adelantar aunque el resto se demore.
3. **No hay `sitemap.ts` ni `robots.ts`.**
4. **Sin datos estructurados** salvo el `VideoObject` de `/watch` (con `uploadDate` fijo `2026-10-09`).
5. **Sin búsqueda, sin breadcrumbs, sin anterior/siguiente, sin artículos relacionados** (solo 3 posts enlazan una guía).
6. Contenido de guías/blog **fuera de las pruebas de paridad EN/FR** (los tests solo cubren diccionarios).

### 1.3 Contenido desactualizado o incorrecto

Ver auditoría §3 (C1–C6). Actualizaciones tras esta revisión:

- **C1 confirmado:** pestañas reales de Settings (EN) = *General · Calendar & Hours · Notifications · Services · Booking page · Team · Locations · Domain & Email · Billing* (+ pestaña de integraciones QuickBooks). Correo/dominio/remitentes viven en **Domain & Email**; **Notifications** tiene número SMS y uso, alertas al staff, recordatorios de cita y aviso "listo para recoger".
- **C5 superado por tu decisión §1.2:** las cifras de SMS ya son definitivas (ver §6.1 de este plan para lo verificado).
- Existe un **diccionario de layout con `nav.notifications = "Email & domain"`** que no corresponde a ningún ítem del sidebar actual: etiqueta huérfana. Es un detalle de producto, no de docs (§10).

### 1.4 Lo que falta

~50 funciones/pantallas sin guía (auditoría §4), más: solución de problemas, glosario, privacidad/CASL, planes y facturación, SMS (consumo y excedentes), changelog real, ayuda dentro del panel y conexión con video.

---

## 2. Arquitectura propuesta

### 2.1 Principios

1. **Una fuente de contenido por artículo**, tipada, con EN y FR obligatorios en el mismo archivo (el compilador impide publicar uno sin el otro).
2. **Tres capas con propósito distinto** (sin duplicarse):
   - **Help Center** (`/help`) — documentación de producto y autoservicio. Tono operativo, pasos, nombres exactos de la interfaz.
   - **Learn / Blog** (`/blog`) — contenido educativo para propietarios; atrae búsquedas, enlaza a Help y Features con naturalidad.
   - **Páginas comerciales** (`/features`, `/product`, `/pricing`, `/integrations`, `/demo`, `/get-started`) — conversión. Siguen siendo la fuente de verdad de precios y capacidades; Help **enlaza** a ellas, no las repite.
3. **Los nombres de menús y botones salen de los diccionarios reales del panel**, no se escriben a mano: un helper `ui("settings.tabs.bookingPage", locale)` lee `src/lib/admin-locale/*`. Si alguien renombra una pestaña, la documentación cambia sola o el test falla.
4. **Los gates de plan salen de `CAPABILITY_MIN_PLAN`** (mismo patrón que `itemMinPlan`/`PLAN_BADGE`), nunca texto libre.
5. **Idioma = URL** (no localStorage) para todo Resources.

### 2.2 Estrategia de idioma por URL [D]

- **EN:** rutas actuales sin prefijo (`/help`, `/blog`, …).
- **FR:** prefijo `/fr/` con slugs traducidos (`/fr/aide/...`) — mejor señal SEO para consultas en francés.
- `hreflang`: `en-CA`, `fr-CA`, `x-default` → EN. Sin redirección automática por `Accept-Language` (recomendación de Google); en su lugar, un aviso discreto "Voir en français" para visitantes con navegador francés (hoy se les cambia el idioma sin cambiar la URL).
- Mecánica: rutas finas por idioma que montan los mismos componentes de servidor (`locale` como prop). Sin `proxy` para esto (el `proxy.ts` actual solo resuelve dominios de talleres en `/` y no se toca).
- `<html lang>`: el layout raíz es único. Opción recomendada: envolver el contenido FR en `lang="fr-CA"` y mantener la sincronización de `document.documentElement.lang` que ya existe. Opción más pura (layouts raíz por grupo de rutas) obliga a mover todo el árbol `app/` y la descarto salvo que quieras ese riesgo.
- El toggle EN/FR del header en rutas de Resources **navega a la URL hermana** (no solo cambia estado) y guarda la preferencia.
- **Páginas comerciales (Features/Product/Pricing/Integrations/Demo/Get started/Contact/About/legales):** ya tienen contenido EN/FR en diccionarios pero comparten URL. Para que el hreflang y el "no inglés bajo ruta francesa" sean coherentes en todo el sitio recomiendo darles también rutas `/fr/...` en **Fase 3b** (cambio de enrutamiento y metadata, sin reescribir copy). Es opcional y tu decisión; si no se hace, Resources FR enlaza a esas páginas en su URL actual y el idioma se resuelve por la preferencia guardada.

### 2.3 Mapa de contenido

```
Help Center (/help)
 ├─ Búsqueda + "Empezar aquí" + categorías + preguntas populares + contacto/chat
 ├─ 16 categorías (hubs) ── artículos
 ├─ Troubleshooting (hub + 9 artículos)
 ├─ Glossary (1 página con anclas)
 └─ Privacy & CASL (hub + 4 artículos)
Quick Start (/quick-start)      checklist única (misma fuente que el onboarding in-app)
Changelog (/changelog)          entradas fechadas por mes, EN/FR
Blog / Learn (/blog)            educativo; posts + 2 páginas pilar
Videos                          sección "Ver GarageOS en acción" (/watch) + slots para tutoriales reales
```

---

## 3. Mapa de rutas (EN y FR)

Convención: `/help/<categoría>/<artículo>`. Las 13 URLs `/guides/<slug>` actuales **redirigen 301** a su equivalente (los 13 mapeos 1:1 están en §4); `/guides` redirige a `/help`. Un único patrón de URL es más predecible para usuarios y buscadores que mantener dos jerarquías. **[D]** Alternativa: conservar `/guides/<slug>` como URL canónica de los artículos y usar `/help/<categoría>` solo como hubs — evita 13 redirects pero deja dos jerarquías.

| Sección | EN | FR |
|---|---|---|
| Help home | `/help` | `/fr/aide` |
| Categoría | `/help/<cat>` | `/fr/aide/<cat-fr>` |
| Artículo | `/help/<cat>/<slug>` | `/fr/aide/<cat-fr>/<slug-fr>` |
| Glosario | `/help/glossary` | `/fr/aide/glossaire` |
| Quick Start | `/quick-start` | `/fr/demarrage-rapide` |
| Changelog | `/changelog` | `/fr/nouveautes` |
| Blog (índice / post) | `/blog`, `/blog/<slug>` | `/fr/blogue`, `/fr/blogue/<slug-fr>` |
| Video | `/watch/en` | `/watch/fr` (ya existe) |
| Buscador (índice JSON, estático) | `/help/search-index.json` | `/fr/aide/search-index.json` |

Categorías (EN → FR provisional; los slugs FR dependen de §10-D1/D2):

| # | EN | FR |
|---|---|---|
| 1 | `getting-started` | `premiers-pas` |
| 2 | `customers-vehicles` | `clients-vehicules` |
| 3 | `appointments` | `rendez-vous` |
| 4 | `booking-page` | `page-de-reservation` |
| 5 | `inspections` | `inspections` |
| 6 | `quotes-work-orders` | `devis-bons-de-travail` *(pendiente D1/D2)* |
| 7 | `invoices-payments` | `factures-paiements` |
| 8 | `inventory-services` | `inventaire-services` |
| 9 | `communications` | `communications` |
| 10 | `team-access` | `equipe-acces` |
| 11 | `subscription-billing` | `abonnement-facturation` |
| 12 | `reports-accounting` | `rapports-comptabilite` |
| 13 | `customer-portal` | `portail-client` |
| 14 | `multi-location` | `multi-emplacements` |
| 15 | `troubleshooting` | `depannage` |
| 16 | `privacy-casl` | `confidentialite-casl` |

Redirects (en `next.config.ts` → `redirects()`, 301): `/guides/*`, `/guides`, y cualquier slug renombrado. Un test recorre la tabla y verifica que cada destino existe en ambos idiomas.

---

## 4. Inventario editorial

Prioridad: **P0** lanzamiento comercial (publicar primero) · **P1** primeras semanas · **P2** después. `Plan` = insignia derivada de `CAPABILITY_MIN_PLAN`.

### 4.1 Artículos existentes (13) → destino

| Guía actual | Acción | Nuevo destino |
|---|---|---|
| `set-up-your-shop` | Actualizar (límite 3 usuarios Core, pestañas reales) | `getting-started/set-up-your-shop` |
| `import-your-data` | Actualizar | `getting-started/import-your-data` |
| `clients-and-vehicles` | Actualizar | `customers-vehicles/clients-and-vehicles` |
| `configure-online-booking` | Actualizar | `appointments/configure-online-booking` |
| `digital-vehicle-inspections` | Actualizar (plantillas/reporte a artículos propios) | `inspections/digital-vehicle-inspections` |
| `estimate-to-invoice` | **Dividir**: cotizaciones / facturas | `quotes-work-orders/create-and-send-quotes` + `invoices-payments/invoices-and-payments` |
| `approval-history` | Actualizar y renombrar | `quotes-work-orders/customer-quote-approval` |
| `work-orders` | Actualizar | `quotes-work-orders/work-orders` |
| `manage-inventory` | Actualizar | `inventory-services/manage-inventory` |
| `maintenance-reminders` | Actualizar | `communications/maintenance-reminders` |
| `branded-communications` | **Reescribir** (apunta a pestaña equivocada) y renombrar | `communications/email-domain-and-sender` |
| `customer-portal` | Actualizar | `customer-portal/customer-portal` |
| `multi-location` | Actualizar | `multi-location/multi-location` |
| Blog ×3 | Revisar, traducir (transcreación FR), fechar | `/blog/...` |
| FAQ ×14 | Migrar a artículos/FAQ por categoría + ampliar | dentro de cada hub |

### 4.2 Artículos nuevos (≈49)

| Categoría | Artículo | Plan | Prio | Fuente de verdad en el código |
|---|---|---|---|---|
| Getting started | `create-account-and-trial` (cuenta, Google, verificación, plan, trial $0, día 14) | — | P0 | `auth.ts`, `onboarding`, `stripe.ts` |
| | `quick-start` (checklist) | — | P0 | `marketing-flow.ts` + onboarding |
| Customers | `find-and-manage-vehicles` (búsqueda, ficha, historial) | — | P1 | `vehicles/[id]`, buscador del topbar |
| Appointments | `manage-appointments` (crear, estados, reprogramar editando, cancelar, no-show, enlace del cliente) | — | P0 | `appointments`, `appointment-manage.ts`, `AppointmentStatus` |
| | `appointment-reminders` | — | P1 | Notifications tab, cron |
| Booking page | `booking-page-design` (fotos, plantilla, tipografía, íconos, destacados, publicar) | Pro (plantillas/tipos) | P0 | `booking-page.ts`, `BookingPageConfigurator` |
| | `booking-page-url-qr-embed` | — | P1 | `BookingQrCode`, `EmbedSnippetCard` |
| | `booking-page-custom-domain` | Pro | P1 | `DomainSettings`, `proxy.ts` |
| | `what-customers-see-when-booking` | — | P2 | `/book/[slug]`, `manage` |
| Inspections | `inspection-templates` | Pro | P1 | `inspections/templates` |
| | `share-inspection-report` | Pro | P1 | `ShareReportPanel`, `/inspection/[token]` |
| Quotes & WO | `create-and-send-quotes` *(del split)* | — | P0 | `quotes` |
| Invoices | `refunds` | — | P1 | permiso `refunds.write` (solo dueño por defecto) |
| | `taxes-gst-qst` (config fiscal, impuestos fijados por factura) | — | P0 | `fiscal.ts`, `tax-presets.ts` |
| Inventory & services | `service-catalog-and-saved-lines` | — | P0 | Services tab, `saved-line-items` |
| | `tire-storage` | Pro | P1 | `tire-storage` |
| Communications | `inbox-email-and-sms` | — | P0 | `/admin/inbox` |
| | `sms-number-setup` (número dedicado, STOP, liberación a 30 días) | — | P0 | `SmsNumberCard`, `SMS_NUMBER_RELEASE_GRACE_DAYS` |
| | `sms-allowance-and-overage` (§6.1) | — | P0 | `sms-usage.ts`, `stripe.ts` |
| | `notification-settings` (pestaña Notifications) | — | P0 | `settings/page.tsx` |
| | `what-messages-does-garageos-send` (tabla evento→canal→tipo) | — | P0 | `casl-matrix.md` (versión pública) |
| | `automated-reminder-rules` | Pro | P1 | `reminder-rules` |
| | `campaigns` | Pro | P1 | `campaigns` |
| Team | `invite-and-manage-team` (límite 3 usuarios en Core) | — | P0 | `PLAN_LIMITS`, `TeamManagement` |
| | `roles-and-permissions` (Owner/Mechanic/Viewer + matriz; permisos finos Pro) | Pro (finos) | P0 | `domain/permissions.ts` |
| Subscription | `plans-and-limits` | — | P0 | `entitlements.ts` |
| | `free-trial` | — | P0 | `TRIAL_DAYS`, `stripe.ts` |
| | `change-plan-and-payment-method` | — | P0 | `BillingCard`, portal Stripe |
| | `subscription-states-and-payment-recovery` (trial vencido, PAST_DUE, modo solo lectura) | — | P0 | `subscription-state.ts` |
| | `cancel-subscription` (cancela al fin de lo pagado; el portal de Stripe **no** cancela) | — | P1 | `cancelSubscriptionAction` |
| Reports & books | `reports` (resumen vs avanzados) | Pro (avanzados) | P1 | `reports` |
| | `quickbooks-online` | Pro | P1 | `QuickBooksCard`, `docs/quickbooks-setup.md` (versión pública) |
| | `accounting-light` | Pro | P2 | `accounting` |
| | `cash-drawer` | — | P2 | `caja` |
| Portal | `what-your-customers-receive` (aprobación, enlace de cita, reporte, "listo") | — | P1 | `/quote`, `/book/manage`, `/inspection` |
| Troubleshooting (9) | `cant-sign-in`, `team-invitation-not-working`, `email-not-received`, `sms-not-delivered`, `import-errors`, `no-times-on-booking-page`, `billing-and-payment-issues`, `quickbooks-connection-issues`, `missing-feature-or-menu` | — | P0×4 / P1×5 | síntomas reales, ver §9 |
| Privacy & CASL (4) | `operational-vs-commercial-messages`, `consent-and-preferences`, `casl-good-practices-for-shops`, `how-garageos-protects-shop-data` | — | P1 (tras revisión legal) | `casl-matrix.md`, esquema, `subprocessors.md` |
| Glossary | `/help/glossary` (~40 términos, EN/FR) | — | P1 | diccionarios |

Totales: 13 existentes (14 destinos tras el split) + ~49 nuevos ≈ **63 artículos**, 16 hubs, glosario, Quick Start, Changelog. Cada uno solo existe si cubre una pantalla o una duda real; no hay artículos "de relleno".

### 4.3 Blog / Learn (educativo, no documentación)

Mantener 3 existentes (actualizar, fechar, traducir) y **añadir 8**, cada uno escrito nativamente para su idioma (no traducción literal), con consulta objetivo clara:

1. *Auto repair shop management software in Canada: what to look for* (pilar) / *Logiciel de gestion de garage au Canada : quoi chercher*
2. *Digital vehicle inspection checklist for independent garages*
3. *Online booking for auto repair shops: setup and common mistakes*
4. *SMS appointment reminders for garages: fewer no-shows, CASL basics*
5. *Quotes and invoices for Canadian repair shops: GST/QST explained simply* (informativo, no asesoría fiscal)
6. *Seasonal tire storage: running it without a spreadsheet* (incluye la regla de neumáticos de invierno en Québec — dato externo a verificar con la fuente oficial al redactar)
7. *Inventory basics for independent garages*
8. *Moving from paper or spreadsheets: a migration checklist for your shop*

Más una segunda página pilar FR (*Logiciel pour garage automobile au Québec*) solo si el primer pilar FR justifica una intención de búsqueda distinta; si no, no se crea.

---

## 5. Priorización

**Oleada 1 (apoyo al lanzamiento comercial):** infraestructura de rutas/idioma/SEO + hub Help con búsqueda + todos los **P0**: primeros pasos, citas, página de reservas, cotizaciones/OT, facturas e impuestos, catálogo, SMS completo, notificaciones, equipo/permisos, planes/trial/facturación, 4 de troubleshooting, Quick Start, Changelog inicial, correcciones C1–C6.
**Oleada 2:** P1 (Pro: plantillas, QuickBooks, campañas, llantas, reportes; portal; CASL tras revisión legal; glosario; 5 troubleshooting; 5 posts).
**Oleada 3:** P2, posts restantes, rutas FR del resto del sitio (3b) si no se hicieron antes, tutoriales en video.

---

## 6. Datos verificados que alimentan el contenido

### 6.1 SMS: asignación, excedentes y facturación [V salvo [?]]

| Tema | Hecho verificado | Fuente |
|---|---|---|
| Unidad | **Segmentos**, no mensajes. GSM-7: ≤160 unidades = 1 segmento, luego 153 por segmento; Unicode se cuenta distinto. Un SMS largo o con acentos/emoji puede consumir varios | `countSmsSegments` (`domain/sms.ts`) |
| Asignación mensual | Core **300** · Pro **1,000** · Complete **2,500** segmentos | `PLAN_LIMITS` |
| Excedente | **$0.05 CAD por segmento** (+ impuestos aplicables [?]) | `SMS_OVERAGE_PRICE_CAD_PER_SEGMENT`; Price Stripe `garageos_sms_overage_monthly`, 5¢, metered, mensual; validado en cada Checkout |
| Qué cuenta | SMS **salientes** que llegaron a Twilio (entregados o fallidos con `providerMessageId`). No cuentan entrantes, ni los que nunca salieron, ni los de demos de ventas | `getSmsSegmentsUsed` |
| Período | **Mes calendario UTC** (1.º a 1.º), no el ciclo de facturación de la suscripción | `smsBillingPeriod` |
| Al llegar al límite | **No se bloquea**: el SMS sigue saliendo y el excedente se factura. Alertas a los dueños al **80 %** y **100 %** (una vez por mes y nivel) | `planSmsOverage`, `checkSmsUsageAlerts` |
| Cómo se cobra | Cada envío con excedente emite un *meter event* a Stripe (idempotente por mensaje); un cron diario reintenta los pendientes hasta 30 días; Stripe factura | `reportSmsOverageUsage`, cron |
| Planes anuales | El ítem de excedente se agrega a la suscripción justo tras el Checkout y se mide/cobra **mensualmente** igual que en planes mensuales | `checkoutLineItems`, `ensureSmsOverageItem` |
| Dónde lo ve el taller | **Settings → Notifications → tarjeta de número SMS**: barra de uso, "renueva el…", aviso de excedente. Facturación (Settings → Billing) **no** muestra SMS **[V: sin referencias en `BillingCard`]** | `SmsNumberCard`, `BillingCard` |
| Cambio de plan | El cupo sigue al plan efectivo en el momento del envío; el consumo del mes se conserva (no hay prorrateo de cupo) | `getSmsAllowance` |
| Sin plan | Sin plan efectivo no hay cupo (no existe plan gratuito) | `getSmsAllowance` |

Por confirmar en Fase 1 con evidencia (no se publica hasta tenerla): **[?]** (a) lectura de solo lectura del Price LIVE en Stripe para confirmar 5¢ y modo; (b) en qué factura de Stripe y en qué fecha aparece el excedente (mensual vs anual) y qué ocurre con el excedente generado durante el trial; (c) si el excedente lleva impuestos; (d) dónde ve el taller el cargo (factura de Stripe/portal). El texto del Help se redacta **solo con lo confirmado**.

Correcciones de coherencia que esto implica (se proponen, no se hacen sin tu aprobación): quitar "VALORES PROVISIONALES" de `entitlements.ts`; `docs/subscription-plans.md` solo dice "Allowance/Larger/Largest"; la página de Precios y la comparación **no muestran cifras de SMS** (hoy: "Included allowance / Larger / Largest") → mostrarlas, derivadas de `PLAN_LIMITS` y la constante de excedente para que no puedan divergir (el test de superficie pública lo vigila).

### 6.2 Roles y permisos [V]

- **Owner**: todos los permisos; ajustes, equipo, facturación, dominios, ubicaciones son **siempre** solo del dueño (no delegables).
- **Mechanic** (rol que usa el mostrador): opera todo el flujo operativo, ve y crea clientes, **factura y cobra**, inventario, DVI; **no** ve contabilidad/caja/reportes, no envía campañas, no importa, no toca configuración, no reembolsa (por defecto).
- **Viewer**: solo lectura de clientes y facturas.
- Pro/Complete: el dueño puede otorgar/revocar permisos delegables por usuario.
- **Límite de usuarios:** Core **3**; Pro y Complete ilimitados (`PLAN_LIMITS`). Ubicaciones: 1 / 1 / ilimitadas.
- No se crea un rol "Front Desk"; la documentación dirá "el mostrador usa el rol Mechanic".

### 6.3 Suscripciones [V]

Sin plan gratuito. Trial 14 días con tarjeta obligatoria, cobro hoy $0. Estados: `AWAITING_PLAN`, `TRIALING`, `ACTIVE`, `PAST_DUE` (conserva plan durante reintentos), `CANCELED/UNPAID/INCOMPLETE` o trial vencido → **RESTRICTED** (solo lectura + Facturación). La cancelación la inicia el dueño dentro de la app y se aplica **al fin de lo pagado** (`cancel_at`), porque el portal de Stripe no ofrece cancelar. Cambio de plan/método de pago: por el portal de Stripe. Detalles de recuperación de pago y retención de datos tras cancelar: **[?]** a confirmar en Fase 1.

### 6.4 Terminología verificada contra la interfaz [V]

| Concepto | EN (UI) | FR (UI hoy) | ES (UI) | Observación |
|---|---|---|---|---|
| Quotes | Quotes | **Soumissions** (≈159 usos) | Cotizaciones | **Tu decisión es "Devis"; la UI FR dice "Soumissions" → conflicto [D1]** |
| Work orders | Work orders | **Ordres de travail** (panel) / **bons de travail** (web, emails) | Órdenes de trabajo | **Inconsistencia interna [D2]** |
| Inbox | Inbox | Boîte de réception | Bandeja | |
| Cash drawer | Cash drawer | Caisse | Caja | |
| Tire storage | Tire storage | Entreposage de pneus | Almacén de llantas | |
| Reminders | Reminders | Rappels | Recordatorios | |
| Help (panel) | Help | Aide | Ayuda | |
| Tabs | Notifications · Domain & Email · Booking page · Calendar & Hours | Notifications · … | Notificaciones · Dominio y Email · … | |

---

## 7. Diseño técnico

### 7.1 Modelo de contenido

```
src/content/resources/
  categories.ts                 # 16 categorías: id, slug{en,fr}, title{en,fr}, icon, order
  articles/<id>.ts              # un archivo por artículo, EN+FR juntos
  glossary.ts                   # términos {en,fr}
  changelog.ts                  # entradas fechadas
  blog/<id>.ts
```

```ts
type Article = {
  id: string; category: CategoryId; kind: "guide" | "faq" | "troubleshooting" | "privacy";
  slug: Localized;                         // semánticos por idioma
  gate?: CapabilityKey;                    // insignia de plan (derivada, no texto)
  uiRefs?: UiRef[];                        // claves de diccionario del panel citadas
  updated: string;                         // ISO real, alimenta sitemap/dateModified
  related: ArticleId[]; next?: ArticleId; prev?: ArticleId;
  video?: { kind: "tutorial" | "overview"; key: string };
  en: ArticleBody; fr: ArticleBody;        // ambos obligatorios (tipos)
};
type ArticleBody = { title; summary; metaTitle?; metaDescription?; blocks: Block[]; keywords?: string[] };
type Block = p | h2 | h3 | steps | callout(info|warning|plan) | uiPath | table | image | videoRef | links;
```

Decisión técnica **[D]**: TS tipado (recomendado) vs MDX. TS evita dependencias nuevas, permite validar paridad, enlaces, claves de UI y gates en tests, y sigue el patrón del repo (`marketing-pages.ts`). MDX da mejor ergonomía de escritura para 60+ artículos pero añade tooling y vuelve difícil verificar nombres de menús. Mitigación en TS: un mini-helper de marcado en línea (`**negrita**`, `[texto](ref:article-id)`, `{ui:settings.tabs.domain}`) para no escribir objetos a mano.

### 7.2 Componentes (reutilizar antes de crear)

| Reutilizar | Cambios |
|---|---|
| `MarketingPageShell`, `PageHero`, `CTASection`, `GarageOSLogo`, `ResourceCards`/`GroupedResourceCards`, `PLAN_BADGE`/`itemMinPlan`, `VideoPlayer` | `Shell`: aceptar `locale` por prop; `Header/Footer`: enlaces por idioma y toggle por URL |
| `ResourceArticleBody` | Se sustituye por `ArticleLayout` (TOC, bloques, estados) |
| `Bilingual` | Deja de usarse en Resources (el idioma ya viene de la ruta) |

Nuevos (pequeños, server-first): `HelpHome`, `HelpSearch` (único cliente grande), `CategoryGrid`, `Breadcrumbs` (+JSON-LD), `ArticleLayout`, `BlockRenderer`, `PlanBadge`, `UiPath` ("Settings → Domain & Email"), `PrevNext`, `RelatedArticles`, `Callout`, `LocaleLink`/`LocaleSwitch`, `ChangelogTimeline`, `Glossary`. Estilo con los tokens existentes (`brand-blue`, slate); paleta oficial Deep Navy `#07182F` / Primary `#1769FF` / Bright `#2583FF` / Off White `#F8FAFC` se verifica contra `globals.css` y los tokens actuales antes de añadir nada nuevo **[?]**.

### 7.3 Búsqueda

- Índice **por idioma**, generado en build desde el contenido (título, resumen, encabezados, palabras clave, categoría, plan, URL) y servido como JSON estático. Carga perezosa al enfocar el campo (≈ <40 KB gzip estimado; se mide).
- Puntuación propia (sin dependencia nueva): normalización de acentos (é/è/ç/ñ), prefijos, pesos título>encabezado>cuerpo, y **sinónimos curados** (quote/estimate, soumission/devis, SMS/texto/textos, "ordre/bon de travail", Core/Pro/Complete).
- Estados: vacío ("escribe para buscar" + populares), sin resultados (sugerencias, categorías, enlace a contacto/chat), carga, error. Teclado (↑↓ Enter Esc), `role="combobox"`/`listbox`, anuncio de resultados para lectores de pantalla.
- Página de resultados `?q=` con `noindex`. No se añade `SearchAction` (Google retiró el sitelinks search box).
- Test: para cada artículo y cada idioma, buscar su título devuelve ese artículo primero; ningún resultado FR devuelve URL EN.

### 7.4 Accesibilidad y rendimiento

Páginas estáticas (SSG) con `generateStaticParams`; JS solo en búsqueda y toggle; breadcrumbs `nav aria-label`; TOC con anclas; contraste AA; foco visible; imágenes con `next/image`, ancho/alto y `alt` traducido; `prefers-reduced-motion`. Capturas del `/demo` ya son webp; se reutilizan, no se duplican.

---

## 8. Integraciones

### 8.1 Ayuda contextual en el panel (discreta)

- Un componente `HelpLink` (icono `CircleHelp` + texto corto "Guide"/"Guide"/"Guía") en el **encabezado de la tarjeta/sección**, alineado a la derecha, sin botones flotantes, sin modales, sin tocar layout.
- Registro `HELP_TOPICS` (clave → id de artículo). La URL se construye con el idioma del usuario: admin `fr` → artículo FR; `en` → EN; **`es` → EN** (no hay Resources en español **[D3]**), con etiqueta en español y atributo `hreflang`. Abre en pestaña nueva para no perder formularios sin guardar.
- Test: cada tema apunta a un artículo existente en ambos idiomas.
- Ubicaciones P0/P1 (archivos reales verificados): `settings/booking-page/BookingPageConfigurator` (diseño de página), `OnlineBookingSettings`/`AppointmentBookingSettings` (disponibilidad), `SmsNumberCard` (número y consumo SMS), `DomainSettings` (correo/dominio), `BillingCard` (planes/facturación), `TeamManagement` (roles/límite), `QuickBooksCard`, `import/ImportWizard`, `inspections` (+ `TemplateManager`, `ShareReportPanel`), pantallas bloqueadas por plan ("Upgrade") enlazando al artículo del plan, y un enlace "Browse the Help Center" en `/admin/support` (el chat humano no se toca).

### 8.2 Video [V salvo [?]]

| Recurso | Tipo | Uso propuesto |
|---|---|---|
| `/watch/{en,fr}` (60 s) y `/teaser` (15 s) | **Comercial** | Bloque "Ver GarageOS en acción" en Help home, Getting started, Features/Product. Se enlaza a `/watch`, no se re-hospeda el MP4 |
| `/demo` (Garage Laurent, 23 capturas/idioma) | **Demostración comercial** (recorrido ilustrativo, no crea datos) | Se enlaza desde artículos de primeros pasos como "ver un ejemplo"; **nunca** como tutorial |
| Tutoriales operativos | **No existen hoy** | El esquema del artículo admite `video: { kind: "tutorial" }`, vacío hasta producir tutoriales reales. Oportunidad: 5–6 tutoriales cortos (reservas, DVI, cotización→factura, SMS, equipo) con guion tomado de los artículos |

Riesgos: **[?]** el CDN de MP4 (R2) figuraba como "decisión pendiente" en `docs/sales-video.md`; hay que confirmar si está desplegado y el registro de la base está publicado antes de enlazar. **[?]** `/watch` registra eventos de visualización de primera parte pensados para atribución de correos de ventas; verificar que un acceso desde Resources no contamine esas métricas (probablemente enlazar la URL limpia sin token, que ya se trata como no atribuida).

### 8.3 Enlaces comerciales

Regla: los artículos de Help solo enlazan a Features/Pricing cuando hay **gating de plan** ("disponible en Pro → ver planes") y a Demo/Signup únicamente en *Getting started*, *Plans* y los posts de blog. Nada de banners de venta en guías operativas ni troubleshooting.

---

## 9. SEO

### 9.1 Técnico

| Elemento | Plan |
|---|---|
| Canonical | Quitar el canonical global del layout; definir por página (`alternates.canonical` + `languages`) |
| Hreflang | `en-CA`, `fr-CA`, `x-default`→EN, recíprocos, en `<head>` y en sitemap |
| `sitemap.ts` | Solo páginas públicas indexables EN+FR con `alternates` y `lastModified` reales (campo `updated`); excluye admin, api, portal, quote, inspection, platform, sales-*, `book/*`, `watch?t=` |
| `robots.ts` | Disallow `/admin`, `/api`, `/platform`, `/portal`, `/quote`, `/inspection`, `/sales`, `/sales-*`, `/account-recovery`, `/activate-demo`; referencia al sitemap. **[D]** `/book/*` (páginas públicas de cada taller): hoy no se desindexa; decidir si se mantiene |
| Titles/descriptions | Únicos por página, ≤60 / ≤155 caracteres, test de unicidad y longitud por idioma |
| Open Graph | Por página con `locale` `en_CA`/`fr_CA`, imagen por defecto por idioma; imagen generada por categoría como mejora opcional |
| Datos estructurados | `BreadcrumbList` (todas), `BlogPosting` (blog, con `datePublished/dateModified` reales), `SoftwareApplication` + `Offer` (Pricing, generado desde `PLAN_PRICING_CAD`), `Organization`/`WebSite` (home), `VideoObject` (ya existe; corregir `uploadDate` al valor real). **No** se añade `FAQPage`/`HowTo`: Google restringió/retiró esos resultados enriquecidos; no aportan y arriesgan "markup no visible" |
| Jerarquía | Un `<h1>` por página; `h2/h3` ordenados; test que lo valida |
| Rendimiento | SSG, sin JS innecesario, fuentes ya optimizadas (`next/font`), imágenes dimensionadas, medir Lighthouse/CWV en Preview |
| Indexabilidad | Todo lo público indexable; `noindex` en resultados de búsqueda, URLs con token y rutas de app |

### 9.2 Editorial (sin keyword stuffing ni páginas gemelas)

Cada consulta se asigna a **una** página. Los volúmenes no están medidos: se validan con Search Console/herramienta de keywords antes de la Oleada 2 (no se inventan cifras).

| Intención | EN | FR | Página |
|---|---|---|---|
| Descubrimiento | auto repair shop management software; garage management software Canada | logiciel de gestion de garage; logiciel pour garage automobile Québec | Pilar blog + `/product` |
| Inspecciones | digital vehicle inspections | inspection numérique de véhicule | `inspections/digital-vehicle-inspections` + post |
| Reservas | online booking for auto repair shops | réservation en ligne garage | `booking-page/booking-page-design` + post |
| Cotización/factura | automotive repair estimates and invoicing | soumission/devis et facturation garage | `quotes-work-orders/*` + post |
| SMS | SMS appointment reminders for garages | rappels de rendez-vous par texto garage | `communications/appointment-reminders` + post |
| Inventario | shop inventory management | gestion d'inventaire de garage | `inventory-services/manage-inventory` + post |
| Pneus | tire storage software | entreposage de pneus | `tire-storage` + post |

Enlazado interno: cada artículo ≥2 relacionados + anterior/siguiente + migas; hubs enlazan a todos sus artículos; posts enlazan a su guía y a Features/Pricing/Demo solo si encaja.

---

## 10. Riesgos, inconsistencias y decisiones pendientes

### Decisiones que necesito de ti

- **D1 — "Devis" vs UI actual.** La interfaz FR dice **Soumissions** (≈159 ocurrencias en panel, portal, página de aprobación, emails y sitio) y "devis" aparece solo en una plantilla de ventas. Para respetar "no introducir nombres que no coincidan con la interfaz" hay tres caminos: **(A, recomendado)** un PR previo y separado que cambie esas cadenas FR a *Devis* (solo textos, sin lógica) y luego documentamos con *Devis*; (B) documentar *Soumission* hoy y cambiar después; (C) usar *Devis* en Resources con nota "(« Soumissions » en la interfaz actual)". C genera confusión; recomiendo A.
- **D2 — "Ordres de travail" vs "bons de travail".** El panel usa *Ordres de travail* y el sitio/emails *bons de travail*. Elegir uno (recomiendo el que decidas para la UI) y alinear.
- **D3 — Español.** El sitio público es EN/FR; el panel es ES/EN/FR. Propuesta: Resources solo EN/FR; usuarios ES del panel reciben el artículo EN (con enlace marcado). ¿Aceptas?
- **D4 — Estructura de URLs.** `/help/<cat>/<slug>` + 301 desde `/guides` (recomendado) vs conservar `/guides/<slug>`.
- **D5 — Páginas comerciales con rutas `/fr/`.** ¿Incluirlas en Fase 3b?
- **D6 — Tecnología de contenido.** TS tipado (recomendado) vs MDX.
- **D7 — Alcance de lanzamiento del Changelog.** El producto sigue sin primer cliente pagando según `docs/launch-readiness.md` (estado 2026-10-06). ¿Publicamos "novedades" desde ahora o desde la fecha de apertura comercial?
- **D8 — Revisión legal** de los 4 artículos de Privacidad/CASL antes de publicar (ya recomendada en `docs/sales-video.md` para textos CASL/Ley 25).
- **D9 — Hotfix del canonical** en una PR aparte, adelantada, si se confirma.

### Riesgos y funcionalidades no verificadas

1. **Facturación del excedente SMS** (cuándo aparece, trial, impuestos, planes anuales): leer Price/factura en Stripe LIVE en solo lectura (Fase 1, con tu autorización).
2. **CASL — controles reales.** `casl-matrix.md` lista como "verificar antes de GO" que la UI de campañas no envíe a suprimidos, que el *unsubscribe* funcione extremo a extremo y que STOP afecte la elegibilidad; los recordatorios de mantenimiento figuran como **"REVIEW CASL basis"**. Hasta confirmarlo en código/pruebas, los artículos describirán solo controles verificados y nunca afirmarán cumplimiento automático ni constituirán asesoría jurídica.
3. **Residencia/ubicación de datos y retención** ("cómo protege GarageOS los datos"): cruzar con `docs/compliance/subprocessors.md` y `retention-destruction.md` antes de afirmar nada.
4. **CDN de video y registro** publicados [?]; métricas de `/watch` [?].
5. **Despliegue vs desarrollo para el Changelog.** Las fechas de merge salen del historial de git; "desplegado" se contrasta con los deployments de Producción en Vercel (solo lectura); "disponible para clientes" requiere confirmar flags/proveedores (Twilio, Resend, QuickBooks: ver tabla de validación de proveedores en `launch-readiness.md`, donde QuickBooks aparece **sin validar en Producción**).
6. **Reprogramación de citas:** se edita la cita (`appointments/[id]/edit`) y el cliente puede confirmar/cancelar desde su enlace; no hay reprogramación autoservicio por el cliente **[?: confirmar en `book/[slug]/manage`]**. No se documenta nada que no exista.
7. **Cambio de rutas** (`/fr/`, redirects, canonical): riesgo de regresión SEO; mitigado con tests de redirects, comparación de sitemap antes/después y revisión en Preview.
8. **Pruebas existentes** (`public-surface.test.ts`) asertan cadenas "Estimates"/precios; se actualizarán junto con la terminología, no se debilitan.

### Inconsistencias de producto (se reportan, **no** se corrigen en este trabajo)

| # | Hallazgo | Dónde |
|---|---|---|
| P1 | FR UI usa *Soumissions*; decisión = *Devis* | diccionarios FR, portal, emails |
| P2 | *Ordres* vs *bons de travail* | `admin-locale/layout.ts`, `marketing-locale.ts` |
| P3 | Comentario "VALORES PROVISIONALES" de SMS ya no es cierto | `src/config/entitlements.ts` |
| P4 | `docs/subscription-plans.md` sin cifras de SMS | docs |
| P5 | Canonical global en el layout raíz | `src/app/layout.tsx` |
| P6 | `nav.notifications = "Email & domain"` huérfano | `admin-locale/layout.ts` |
| P7 | Páginas de Precios/Features no muestran cifras de SMS | `marketing-plans.ts` |
| P8 | `VideoObject.uploadDate` fijo | `src/lib/watch-page.tsx` |
| P9 | `docs/marketing-resources-audit.md` y `docs/navigation-map.md` obsoletos | docs |

### Documentación interna detectada (no se publica)

`docs/sales-*`, `garageos-lead-engine-field-planner-roadmap.md`, `docs/compliance/*` (incluida la matriz CASL de ventas), `stripe-live-*`, `operations-runbook.md`, `provider-isolation.md`, `platform-super-admin.md`, `super-admin-todo.md`, `video/`, y todo `src/app/platform`, `src/components/sales-*`, `/activate-demo`, `/admin/demo`. Solo `quickbooks-setup.md` y partes de `casl-matrix.md` (columna de flujos de taller) contienen material **adaptable**, siempre reescrito para taller, nunca copiado.

---

## 11. Plan de ejecución (4 fases, máx. 2 agentes)

**Fase 1 — Arquitectura y verificación** (1 agente, sin cambios visibles)
- Verificaciones [?] de §10 (Stripe en solo lectura, canonical en HTML, CDN, reprogramación, controles CASL).
- Inventario final de textos de UI (EN/FR/ES) → tabla de términos aprobada (D1/D2).
- Diseño de esquema de contenido y rutas; borrador de los 63 artículos en outline.
- *Áreas:* lectura de `src/**`, Stripe/Vercel MCP lectura; salida: documento de verificación + este plan ajustado.
- *Criterio:* todas las [?] cerradas o reclasificadas; decisiones D1–D9 resueltas.

**Fase 2 — Núcleo (plataforma + contenido P0)** (2 agentes: A plataforma, B contenido)
- A: `src/content/resources/**` (esquema), rutas EN/FR, componentes (§7.2), búsqueda, redirects en `next.config.ts`, helper `ui()`/`HelpLink` registry, `MarketingPageShell/Header/Footer` por idioma.
- B: artículos P0 EN+FR, FAQ, Quick Start, Changelog inicial, correcciones C1–C6 y terminología.
- *Tests nuevos:* paridad EN/FR por artículo; claves de UI existentes; gates = `CAPABILITY_MIN_PLAN`; enlaces internos y `related/next/prev` válidos; slugs únicos; tabla de redirects; búsqueda por idioma; denylist de términos internos; sin `lang="en"` fijo.
- *Criterio:* `tsc`, `eslint`, `npm test` verdes; `next build` genera todas las rutas EN/FR; ninguna página FR contiene texto EN.

**Fase 3 — Integraciones y SEO** (2 agentes: A SEO técnico/video, B contenido P1 + ayuda contextual)
- `sitemap.ts`, `robots.ts`, canonical/hreflang/OG por página, JSON-LD (§9.1), fix de `uploadDate`, bloques de video y `/demo`, `HelpLink` en las pantallas listadas, enlace en `/admin/support`, mostrar cifras de SMS en Precios (si aprobado) y **3b** rutas FR comerciales (si aprobado).
- Contenido P1 y posts de Oleada 2; revisión legal CASL.
- *Criterio:* sitemap/robots válidos; validador de datos estructurados sin errores; hreflang recíproco (test); Lighthouse SEO/Accesibilidad/CWV en Preview dentro de umbrales acordados; ningún enlace del panel a artículo inexistente.

**Fase 4 — QA y publicación**
- Suite completa (`npm run check`, `npm test`, `next build`), revisión nativa de FR (idealmente por persona de Québec), revisión de terminología, QA visual móvil/tablet/escritorio con captura en Preview, prueba de redirects 301 (los 13 + `/guides`), comprobación de búsqueda y teclado, contraste y lector de pantalla básico.
- PR con descripción por fase, sin merge ni deploy hasta tu autorización.
- *Criterio:* checklist de §12 completo.

---

## 12. Criterios de aceptación globales

1. Cada afirmación funcional tiene una fuente en código/config y cada nombre de menú sale del diccionario real.
2. Todo artículo, categoría, FAQ y changelog existe en EN y FR con ruta propia; cero texto EN bajo `/fr/` y viceversa.
3. Cifras de SMS, excedente, límites y precios derivadas de constantes y cubiertas por tests; ninguna referencia a "provisional".
4. Los 13 `/guides/*` redirigen 301 y no hay enlaces internos rotos (test).
5. Búsqueda funcional por idioma, accesible por teclado, con estados vacío/sin resultados.
6. Sitemap, robots, canonical y hreflang correctos; JSON-LD válido.
7. Ningún contenido del CRM de ventas ni documentación interna publicada.
8. Lógica comercial, permisos, suscripciones y cobros **sin cambios**.
9. `tsc`, `eslint`, `npm test` y `next build` en verde.

---

## 13. Oportunidades adicionales (con valor real, fuera de lo pedido)

1. **Hotfix de canonical** (probable pérdida de indexación hoy).
2. **Una sola fuente para Quick Start y onboarding in-app**, evitando listas distintas.
3. **Tabla "¿Qué plan necesito para…?"** reutilizable en Help, Pricing y bloqueos del panel.
4. **Página de estado de funciones/limitaciones honestas** (qué *no* hace GarageOS: pagos con tarjeta, API pública, calendario externo) — ya existe en Integrations; enlazarla desde Help reduce tickets y construye confianza.
5. **Pruebas de enlaces/paridad en CI** para que Resources no vuelva a desfasarse (el mayor riesgo a futuro).
6. **Registro de "última revisión" por artículo** y rutina trimestral.
7. **Tutoriales en video reales** (5–6) con guion derivado de los artículos.
8. **Medición** (sin cookies, patrón first-party ya usado en `/api/video`): búsquedas sin resultado y artículos más vistos para priorizar contenido.
9. **Plantilla de respuesta de soporte** que cite artículos, reutilizando el chat de `/admin/support`.

---

## 14. Qué necesito para empezar

Aprobación del plan y respuestas a **D1–D9** (mínimo D1, D2, D3, D4, D6, D7). Con eso, Fase 1 arranca en `claude/resources-renovation` desde `origin/main`.
