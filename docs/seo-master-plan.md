# GarageOS — Plan maestro SEO + Resources Renovation

Estado: **PROPUESTA PARA APROBACIÓN. No se ha implementado ningún cambio funcional.**
Fecha: 2026-10-10 · Base: `origin/main` @ `891f5ae`
Documentos relacionados: `docs/resources-audit-2026-10.md` (auditoría de contenido) · `docs/resources-renovation-plan.md` (**Anexo A**: Help Center, artículos, búsqueda, ayuda contextual; sigue vigente salvo donde este documento lo ajusta explícitamente).

## Cómo leer este documento

Cada afirmación lleva una etiqueta:

| Etiqueta | Significado |
|---|---|
| **[V]** | **Verificado** en el código del repositorio o en una fuente citada |
| **[P]** | **Propuesta** nuestra (decisión de diseño; se aprueba o se cambia) |
| **[H]** | **Hipótesis** que requiere investigación o datos antes de actuar |

**Límites de la investigación (importante):**
- La herramienta de búsqueda web de esta sesión es **solo EE. UU.** y no pude abrir sitios de terceros (`WebFetch` falla con error de DNS). Los SERP canadienses/quebequenses no se vieron directamente y la información de competidores sale de **fragmentos de resultados y directorios** (Capterra, GetApp, Software Advice), no de las páginas oficiales. Por eso **no hay volúmenes de búsqueda ni datos de dificultad** (no existe acceso a Search Console, Keyword Planner ni herramientas de pago) y **no se inventan**.
- GABAN: el repo se clonó con `--depth 1` (un solo commit), por lo que no hay historial; **no hay datos de tráfico**, y no se atribuye rendimiento a ninguna página.

---

## 0. Decisiones ya tomadas (entrada de este plan)

| Tema | Decisión |
|---|---|
| Terminología | EN **Quotes** · FR **Devis** · ES **Cotizaciones** |
| Idiomas públicos | EN-CA y FR-CA con cobertura nacional; ES solo donde ya existe soporte (panel/páginas de taller) |
| Rutas | EN en rutas actuales; FR bajo `/fr/` |
| SMS | Core 300 · Pro 1,000 · Complete 2,500 segmentos/mes; excedente $0.05 CAD/segmento; mes calendario UTC; alertas 80 %/100 %; el envío no se bloquea. Definitivo, no provisional |
| Roles | Owner, Mechanic, Viewer; el mostrador usa Mechanic; no se crea "Front Desk" |
| Changelog | Se conserva, con entradas fechadas y verificables |
| Alcance local | Sin páginas locales que sugieran oficinas o presencia física inexistente |

Conflicto que sigue abierto: la interfaz FR actual dice **«Soumissions»** (≈159 usos). Para documentar «Devis» sin contradecir la UI hace falta un PR previo de **solo textos** (§12, PR-04). Requiere tu aprobación explícita porque toca cadenas de producto (no lógica).

---

## Estado de ejecución (actualizado 2026-10-10)

Plan **aprobado**; implementación por tandas, revisando cada una antes de autorizar la siguiente. Máximo dos agentes. Sin merge ni deploy sin aprobación.

### Decisiones definitivas

| ID | Decisión |
|---|---|
| D1 | «Devis» sustituye a «Soumissions», con revisión contextual de traducciones, en un PR independiente |
| D2 | «Ordres de travail» es el término operativo estándar; «bons de travail» queda como sinónimo cuando corresponda |
| D5 | Rutas `/fr/` para todo el sitio público; ambas lenguas indexables y con cobertura nacional |
| D9 | Hotfixes inmediatos: canonical (confirmando antes en el HTML renderizado) y privacidad/indexación (incluida la revisión de fugas de token por Referer, logs y analítica) |
| D10 | Dominio autoridad `https://www.garage-os.ca`; verificar redirects y configuración sin tocar DNS; la página de GarageOS en GABAN se conserva por ahora |
| D13 | Ampliar la analítica propia (idioma, landing, canal, clics a Demo/Pricing/Signup, atribución de registro); sin Google Analytics; privacidad primero, sin cookies de seguimiento |
| D14 | Formulario de demo: estudiarlo como PR futuro separado, reutilizando el CRM; **no implementar todavía** |
| D15 | Search Console, Bing y servicios externos de SEO: etapa final, a cargo del propietario. Ver `docs/seo-manual-checklist.md` |

### Tandas

| Tanda | Contenido | Estado |
|---|---|---|
| 1 | PR A canonical · PR B privacidad e indexación | **Cerrada (2026-10-10)** — PR #99 (`625c7ab`) y PR #100 (`007e5fe`) mergeados y verificados en producción |
| 2 | Terminología francesa · enrutamiento EN/FR · SEO técnico multilingüe · páginas comerciales prioritarias | Plan técnico listo: `docs/seo-round-2-plan.md`; **pendiente de autorización** |
| 3 | Renovación de Resources · Help Center bilingüe · documentación P0/P1 · videos y ayuda contextual | Pendiente |
| 4 | Contenido educativo · comparativas verificadas · analítica y conversiones · optimización · validaciones finales | Pendiente |

### Cierre de la tanda 1

| Verificación en producción (deployment `dpl_BQEKCH98…`, commit `007e5fe`, alias `www.garage-os.ca`) | Resultado |
|---|---|
| `/robots.txt` | 200, 25 reglas, sin `Sitemap:` todavía |
| `/api/track` | 405 con `X-Robots-Tag: noindex, nofollow, noarchive` |
| `/help`, `/pricing` | 200; `canonical` y `og:url` propios (`https://www.garage-os.ca/help`, `…/pricing`), sin `meta robots` |
| `/book/garage-laurent-demo` | No existe en producción (taller de la base local): no aplica |

- **Incidencia de build resuelta:** el Preview del último commit del PR #100 falló una vez con `Turbopack build failed: next/font/google queries have exactly one entry` (fuente Oswald). Ajeno al diff; un único reintento del mismo commit pasó. Si se repite en `main`, investigar aparte.
- **Dry-run de PageView en producción: NO ejecutado.** Sin acceso autorizado (la BD de la app es Neon; el proyecto Supabase conectado es solo almacenamiento). Procedimiento y criterios de decisión: `docs/pageview-token-purge-runbook.md`.
- **Pendientes no bloqueantes:** variable `NEXT_PUBLIC_APP_URL` de Preview; click-tracking de Resend (paso final de configuración externa); confirmar con `curl -I https://www.garage-os.ca/help` que no hay `x-robots-tag` en el dominio público (Vercel lo añade en URLs `*.vercel.app`); Search Console y Bing al final.
- Plan técnico de la tanda 2: `docs/seo-round-2-plan.md`.

### Hallazgos de la tanda 1 que ajustan este plan

- **Canonical confirmado en producción** (HTML de `main` @ `23a129c`): `/help` declaraba `canonical` y `og:url` = home. Era el problema que sospechábamos en §1.2.
- **Host de producción confirmado**: `garage-os.ca` → 308 → `www.garage-os.ca`; `NEXT_PUBLIC_APP_URL` de producción rinde `https://www.garage-os.ca`. La variable de **Preview** es un valor fijo antiguo: los canonicals de Preview llevan ese host (inofensivo, pero solo las rutas son verificables en Preview).
- **Fuga de tokens en la analítica propia** (nuevo, más grave que lo indexable): el beacon enviaba cualquier ruta y `PageView.path` guardaba los tokens de portal, cotización, inspección, gestión de cita y páginas de ventas. Corregido en PR B; las filas históricas requieren el script de limpieza (checklist §C).
- **`Referrer-Policy`**: se usa `same-origin`, no `no-referrer`, porque este último hace que los navegadores envíen `Origin: null` en POST del mismo origen y rompería los Server Actions (aprobación de cotización, enlace de cita).
- **robots.txt ya existe en PR B** (adelantado desde PR-02); el sitemap sigue en PR-03.

## 1. Diagnóstico SEO actual de todo GarageOS

### 1.1 Mapa de indexación por familia de rutas [V]

| Familia | Rutas | Estado actual | Debe ser |
|---|---|---|---|
| Sitio de marketing | `/`, `/product`, `/features`, `/pricing`, `/integrations`, `/demo`, `/get-started`, `/quick-start`, `/about`, `/contact`, `/privacy`, `/terms`, `/changelog` | Indexable; title/description presentes; **canonical heredado = home**; HTML siempre en inglés | Indexable, canonical propia, EN+FR con hreflang |
| Resources | `/help`, `/guides/*`, `/blog/*` | Indexable; solo EN | Indexable EN+FR |
| Video | `/watch/{en,fr}`, `/teaser` | Indexable limpio; **con `?t=` → noindex**; canonical + hreflang + `VideoObject` ya correctos | Mantener; corregir `uploadDate` fijo |
| Páginas públicas de cada taller | `/book/[slug]` y subdominios/dominios propios (rewrite desde `/` por `proxy.ts`) | Indexable; canonical por taller = `bookingPublicUrl`; metadata en francés | Política explícita (ver §6.3) |
| Enlaces con token (datos personales) | `/portal/*` | `noindex, nofollow, nocache` ✔ | ✔ |
| | `/inspection/[token]` | `noindex` ✔ | ✔ |
| | `/quote/[token]` | **Sin robots**; solo `title` | ✘ falta `noindex` |
| | `/book/[slug]/manage/[token]` | **Sin metadata ni robots** | ✘ falta `noindex` |
| | `/sales/{book,meeting,unsubscribe}/[token]`, `/sales-invite`, `/sales-recover*`, `/account-recovery`, `/activate-demo/[id]`, `/demo/booking` | `noindex` ✔ | ✔ |
| Autenticación | `/admin/login`, `/admin/signup`, `/admin/verify-email-sent`, `/admin/activation-payment`, `/admin/onboarding` | **Sin robots** | `noindex` (el embudo de adquisición pasa por `/get-started`) |
| Panel de taller / plataforma | `/admin/(shop)/*`, `/platform/*` | Requieren sesión (redirigen a login); sin robots | `Disallow` en robots.txt + `noindex` defensivo |
| API | `/api/*` | `/api/video/*` con `no-store` + `X-Robots-Tag: noindex` ✔; el resto sin cabecera | `Disallow` |

### 1.2 Hallazgos técnicos [V salvo indicación]

1. **Idioma solo en el cliente.** `MarketingLocaleProvider` decide EN/FR tras hidratar (localStorage/navigator). Una URL = un idioma para el rastreador: **todo el francés es invisible para Google**.
2. **Canonical heredado.** `src/app/layout.tsx` fija `alternates.canonical = getAppUrl()`. **[H]** Por herencia de metadata de Next, las páginas sin `alternates` propio declaran como canónica la home. Hay que confirmarlo en el HTML renderizado antes de dar por perdida la indexación; en cualquier caso, corregirlo es de bajo riesgo.
3. **Sin `sitemap` ni `robots`.**
4. **`<html lang="en">` fijo** en el layout raíz; `document.documentElement.lang` se cambia por efecto en el cliente.
5. **Datos estructurados:** solo `VideoObject` en `/watch`. Nada de `Organization`, `WebSite`, `SoftwareApplication`, `BreadcrumbList`.
6. **Open Graph:** una sola imagen global (`/og-image.png`), `locale en_CA` + `alternateLocale fr_CA` global; sin OG por página.
7. **Enlazado interno:** header (Product, Features, Pricing, Resources ▾), footer, CTAs; sin migas, sin enlaces contextuales entre contenidos, sin artículos relacionados.
8. **Rendimiento:** las páginas de marketing son server components con poco JS; el `/demo` usa 23 capturas webp por idioma (≈6 MB en total, cargadas en la visita). **[H]** Medir CWV real; no hay datos.
9. **Marca:** una búsqueda de «GarageOS auto repair shop software» no devolvió el producto, sino nombres similares (Garage360, «Garage»). **[H]** (búsqueda US-only): autoridad de marca prácticamente nula y riesgo de confusión de nombre → reforzar `Organization`/`SoftwareApplication` y el descriptor «GarageOS — logiciel/software de gestion de garage».
10. **Posible duplicado de marca en otro dominio:** el sitio de **GABAN Solutions** publica `gabansolutions.ca/software/garageos` describiendo GarageOS. **[V]** Hay que decidir qué URL es la autoridad del producto (§13, D10).

### 1.3 Analítica existente (auditada antes de proponer nada nuevo) [V]

| Pieza | Qué hace | Límites |
|---|---|---|
| `AnalyticsBeacon` + `/api/track` + modelo `PageView` | Pageview de **primera parte**, sin cookies ni scripts de terceros; guarda `path`, `referrerHost`, `utm_source/medium/campaign`, dispositivo, navegador, país (cabecera de Vercel), `shopSlug`, y un `visitorHash` = hash de IP+UA con **sal diaria** (no se guarda IP). Filtro de bots por user-agent. Excluye `/admin`, `/platform`, `/activate-demo`, `/demo/booking` | **`locale` está fijo en `"en"` en el cliente** → no se puede segmentar por idioma. El hash cambia cada día → **no enlaza visitas entre días ni con un registro**. No registra eventos (clics en CTA) |
| `/platform/analytics` | Panel solo Super Admin: series 24 h / diaria, desglose por rango | Sin dimensión de idioma, canal orgánico, ni embudo |
| Video de ventas (`/api/video/*`) | Atribución de correos de ventas con token, sin cookies | Pensado para el CRM; no mezclar con SEO |
| Dependencias de terceros | **Ninguna** (`@vercel/analytics`, GA, Plausible, PostHog, Speed Insights: no presentes) | — |
| Search Console / Bing | No hay etiqueta de verificación en el código **[?]** (puede estar verificado por DNS) | Hay que confirmar acceso |

### 1.4 Embudo de conversión disponible hoy [V]

Visitante → `/get-started` → **`/admin/signup`** (email o Google) → verificación → plan + tarjeta (trial 14 días, $0 hoy). Otras salidas: `/demo` (recorrido), `/watch` (video con CTA), `/contact` (**solo `mailto:`**, sin formulario). `/sales/book/[token]` (reservar reunión) existe pero **solo para prospectos con token del CRM**. **No existe un formulario de «solicitar demo» para tráfico orgánico.** Tampoco se captura de dónde vino quien se registra (**no hay atribución de registro**).

---

## 2. Integración del plan SEO original con Resources

Tres motores, un solo sitio, **cada tema con un único «dueño» por intención** para no duplicar:

| Motor | Qué capta | Dónde vive | Tono | Ejemplo (tema «inspección digital») |
|---|---|---|---|---|
| **A — Comercial** | Dueños que comparan/compran software | `/features/*`, `/solutions/*`, `/compare/*`, `/pricing`, `/demo` | Beneficio + prueba + CTA | `/features/digital-vehicle-inspections` |
| **B — Educativo** | Búsquedas informativas del oficio | `/blog/*`, `/glossary`, recursos descargables (futuro) | Enseña el oficio; menciona GarageOS solo si encaja | «Digital vehicle inspection checklist for independent garages» |
| **Soporte** | Clientes/prospectos que quieren *cómo se hace en GarageOS* | `/help/*` | Pasos exactos con nombres de la UI | `/help/inspections/digital-vehicle-inspections` |
| **C — Bilingüe nacional** | Infraestructura transversal | Rutas EN/FR, hreflang, sitemap | — | — |

**Reglas anti-duplicación [P]:**
1. Una consulta objetivo = una página. Se registra en el **mapa de keywords** (§7); un test falla si dos páginas del mismo idioma declaran el mismo `primaryKeyword`.
2. **Help** no apunta a consultas informativas genéricas (esas son del Blog) y **Blog** no contiene pasos clic-a-clic (eso es de Help). Se enlazan entre sí.
3. **Features** vende el *qué y por qué*; **Help** documenta el *cómo*; **Blog** enseña el *oficio*. Los tres con enlace cruzado, títulos y H1 distintos.
4. El Anexo A describe 63 artículos de Help; **no se añade ningún artículo de Help con fines solo SEO**. El crecimiento orgánico nuevo se canaliza por Features/Solutions/Compare/Blog.

Resources pasa a ser el *paraguas* editorial: `/resources` (hub que enlaza Help, Blog, Glosario, Videos, Changelog, Quick Start) **[P]**, `/fr/ressources`.

---

## 3. Estrategia nacional bilingüe EN/FR

**Principio [P]:** ambos idiomas son **nacionales**. El idioma de la página lo determina la **URL**, no el navegador ni localStorage; la **región** solo cambia ejemplos, impuestos y reglas citadas.

- **EN-CA:** servir a Canadá entero (incl. Québec anglófono).
- **FR-CA:** servir al Québec **y** a francófonos de NB, ON, MB, etc. No se escribe «para Québec» salvo en contenido que realmente lo sea (p. ej. regla de pneus d'hiver).
- **Cobertura fiscal real [V]:** `tax-presets.ts` incluye presets para todas las provincias y territorios (GST, GST+PST, GST+QST, HST), incluida Québec (`CA-QC`). Se puede afirmar «TPS/TVQ, TVH y TPS+PST», no más; avisando que el taller confirma tasas con su contador (así lo dice el propio código).
- **Contenido regional como *secciones*, no como páginas clonadas** [P]: p. ej. «Québec: TPS/TVQ y pneus d'hiver» dentro de un artículo nacional, o artículos cuya premisa es regional por naturaleza (regla de neumáticos de invierno de Québec: **verificado en SAAQ**: 1.º dic. → 15 mar., vehículos matriculados en Québec) .
- **Sin páginas «Montréal/Laval/Rive-Sud»** [P]. La venta presencial en esa zona se apoya con: (a) enlaces con UTM y QR hacia `/demo` o `/get-started` desde material de campo (el CRM ya tiene modo FIELD) y (b) la atribución por parámetro de §10. No se crea Google Business Profile (exige presencia/servicio de área real; no aplica) **[H: validar con política de Google]**.
- **Búsquedas francesas [H, observación limitada]:** en una consulta FR (búsqueda US-only) los resultados fueron casi exclusivamente **editores y portales franceses** (Fiducial, La Fabrique du Net, etc.) y **ningún editor québécois/canadiense** apareció. Si un SERP geolocalizado en Québec lo confirma, es una **oportunidad real** para contenido FR nativo sobre TPS/TVQ, soporte en francés y operaciones locales.
- **Redacción nativa:** el FR se **transcrea** (no se traduce literal), con revisión por hablante de Québec; mismos hechos, mismas cifras, mismos términos de UI.

---

## 4. Arquitectura de URLs y redirects

### 4.1 Reglas

- **EN sin prefijo, FR con `/fr/`** y slugs FR traducidos. `x-default` → EN. Códigos `en-CA` / `fr-CA`.
- **Sin redirección automática por `Accept-Language`/IP.** Visitantes con navegador francés ven un aviso discreto «Voir cette page en français» con enlace a la URL hermana; la preferencia explícita se guarda (localStorage) solo para prellenar el selector, nunca para decidir el HTML del rastreador.
- Una **tabla única de rutas** (`src/lib/seo/routes.ts`) mapea cada página: `id → {en, fr}`; de ella salen enlaces, selector de idioma, hreflang, sitemap y redirects. Un test verifica reciprocidad y que no queden destinos inexistentes.
- Sin barra final; `lowercase`; sin acentos en slugs FR.
- **Comportamiento actual a verificar antes de tocarlo [?]:** host canónico (`garage-os.ca` vs `www`), redirecciones existentes en Vercel (`vercel.json` solo tiene crons), y que `proxy.ts` (matcher `"/"`, solo hosts de talleres) no interfiera con `/fr`.

### 4.2 Tabla de rutas (propuesta)

| Página | EN | FR |
|---|---|---|
| Home | `/` | `/fr` |
| Producto | `/product` | `/fr/produit` |
| Funcionalidades (hub) | `/features` | `/fr/fonctionnalites` |
| Funcionalidad (detalle) | `/features/<slug>` | `/fr/fonctionnalites/<slug-fr>` |
| Soluciones (hub / detalle) | `/solutions`, `/solutions/<slug>` | `/fr/solutions`, `/fr/solutions/<slug-fr>` |
| Comparar (hub / detalle) | `/compare`, `/compare/garageos-vs-<vendor>` | `/fr/comparer`, `/fr/comparer/garageos-vs-<vendor>` |
| Precios | `/pricing` | `/fr/tarifs` |
| Integraciones | `/integrations` | `/fr/integrations` |
| Demo / Watch | `/demo`, `/watch/en` | `/fr/demo`, `/watch/fr` *(ya existe)* |
| Empezar | `/get-started` | `/fr/commencer` |
| Resources (hub) | `/resources` | `/fr/ressources` |
| Help | `/help/...` | `/fr/aide/...` *(Anexo A)* |
| Quick Start | `/quick-start` | `/fr/demarrage-rapide` |
| Blog | `/blog/<slug>` | `/fr/blogue/<slug-fr>` |
| Glosario | `/glossary` | `/fr/glossaire` |
| Changelog | `/changelog` | `/fr/nouveautes` |
| Contacto / Acerca / Legal | `/contact`, `/about`, `/privacy`, `/terms` | `/fr/contact`, `/fr/a-propos`, `/fr/confidentialite`, `/fr/conditions` |

*(Ajuste respecto al Anexo A: el glosario pasa a `/glossary` por ser contenido educativo enlazable; el resto de rutas de Help se mantiene.)*

### 4.3 Redirects (301, en `next.config.ts`)

`/guides` → `/help`; `/guides/<slug>` (13) → destino nuevo de Help (tabla en Anexo A §4.1); cualquier slug renombrado (p. ej. `estimate-to-invoice` → `quotes-work-orders/create-and-send-quotes`). Test: cada origen responde 301 a un destino que existe en ambos idiomas. Ninguna URL actual se elimina sin redirect.

---

## 5. Mapa de páginas

### 5.1 Comerciales (Motor A)

**Existentes (12 → ×2 idiomas):** Home, Product, Features, Pricing, Integrations, Demo, Get started, About, Contact, Privacy, Terms, Changelog. *(Contenido ya bilingüe en diccionarios; el trabajo es enrutamiento + metadata.)*

**Nuevas — `/features/<slug>` (11 detalle) [P]:** solo funciones que **existen** [V].

| Slug EN | Consulta principal (hipótesis) | Plan |
|---|---|---|
| `online-booking` | online booking for auto repair shops | todos (diseño avanzado Pro) |
| `digital-vehicle-inspections` | digital vehicle inspection software | básico todos; fotos/plantillas/reporte Pro |
| `quotes-and-approvals` | auto repair estimate software | todos |
| `work-orders` | automotive work order software | todos |
| `invoicing-and-payments` | auto repair invoicing software | todos |
| `customer-portal` | customer portal auto repair | todos |
| `sms-and-email` | SMS appointment reminders for garages | todos (cupo por plan) |
| `service-reminders` | maintenance reminder software shop | básicos todos; automáticos Pro |
| `inventory-and-tire-storage` | shop inventory management / tire storage | Pro |
| `reports-and-quickbooks` | auto repair shop reporting / QuickBooks | Pro |
| `multi-location` | multi-shop management | Complete |

**Nuevas — `/solutions/<slug>` (6, por problema) [P]:** `replace-spreadsheets-and-paper` · `reduce-no-shows-fill-your-schedule` · `get-quotes-approved-faster` · `seasonal-tire-storage` · `gst-qst-invoicing-and-accounting` · `run-multiple-locations`. Regla: una solución nace solo si resuelve un problema distinto y enlaza a ≥2 funciones reales; no se crean variantes por ciudad ni por palabra clave.

**Compare (`/compare`) [P]:** hub «Cómo elegir software para taller» con metodología y fecha de verificación, más comparativas **solo con datos verificables** (§8). Candidatas, en orden: *GarageOS vs hojas de cálculo/papel* (sin riesgo legal), y después AutoLeap, Shopmonkey, Tekmetric, Protractor. Sin comparativa hasta tener páginas oficiales del competidor verificadas (limitación actual: sin acceso web a sitios externos).

### 5.2 Soporte (Help, ≈63 artículos — Anexo A) y educativo (Blog)

Help: sin cambios respecto al Anexo A (16 categorías, 63 artículos, troubleshooting, privacidad/CASL).
**Blog (Motor B) — propuesta de 12 temas EN + 6 FR nativos [P]** (selección final tras validar demanda con herramientas, §7):

| # | Tema | Tipo |
|---|---|---|
| 1 | Auto repair shop management software in Canada: how to choose | Pilar EN (+ FR nativo «Logiciel de gestion de garage : comment choisir») |
| 2 | Digital vehicle inspection checklist for independent garages | Educativo (+ FR) |
| 3 | How online booking cuts no-shows in a repair shop | Educativo |
| 4 | Quote, estimate, work order, invoice: the repair-order flow explained | Educativo / glosario vivo |
| 5 | GST/QST/HST on repair invoices: what a shop should track *(informativo, no es asesoría fiscal)* | Educativo (+ FR TPS/TVQ) |
| 6 | Seasonal tire storage and Québec's winter-tire rule | Educativo regional (+ FR «Pneus d'hiver au Québec») |
| 7 | SMS reminders and CASL: operational vs commercial messages for shops | Educativo (+ FR LCAP) — tras revisión legal |
| 8 | From paper or spreadsheets to shop software: a migration checklist | Educativo (+ FR) |
| 9 | Inventory basics for independent garages | Educativo |
| 10 | Customer communication templates for repair shops | Educativo |
| 11 | Choosing between spreadsheets, QuickBooks and shop software | Comparativo educativo |
| 12 | Metrics an independent shop owner should watch | Educativo |

Cada post: autor/revisor identificados, `datePublished`/`dateModified` reales, fuentes externas citadas (SAAQ, CRA, Revenu Québec), una llamada a la acción contextual como máximo, enlaces a Help/Features/Pricing/Demo solo si son naturales.

**Totales aproximados (por idioma):** 12 páginas existentes + 11 funciones + 6 soluciones + 1–5 comparar + 63 Help + 16 hubs + glosario + hub Resources + 12 posts ≈ **125 URLs EN y 125 FR**.

---

## 6. SEO técnico y seguridad de indexación

### 6.1 Principios [P]
1. **Lista blanca, no lista negra:** solo se indexa lo que está en la tabla de rutas públicas; todo lo demás es `noindex` por defecto.
2. **Defensa en profundidad:** `robots.txt` (Disallow) **y** `noindex` por metadata/cabecera en toda ruta con token o sesión. Nunca bloquear con `robots.txt` algo que debe verse como `noindex` por un rastreador (ambos mecanismos con roles distintos).
3. No se bloquea contenido público de valor (marketing, Resources, `/watch` limpio, `/book/[slug]` según política).

### 6.2 Elementos

| Elemento | Propuesta |
|---|---|
| Canonical | Quitar el canonical global; helper `buildMetadata({id, locale, …})` genera `alternates.canonical` + `languages` por página |
| `robots.ts` | `Allow: /`; `Disallow`: `/admin`, `/platform`, `/api`, `/portal`, `/quote`, `/inspection`, `/sales`, `/sales-invite`, `/sales-recover`, `/sales-recovery-email`, `/account-recovery`, `/activate-demo`, `/demo/booking`; `Sitemap:` |
| `noindex` faltante | `/quote/[token]`, `/book/[slug]/manage/[token]`, `/admin/login`, `/admin/signup`, `/admin/verify-email-sent`, `/admin/activation-payment`, `/admin/onboarding` (vía `metadata` o layout) |
| `sitemap.ts` | Solo URLs de la tabla de rutas, con `alternates.languages` y `lastModified` reales; sitemap index si crece (comerciales / help / blog) |
| Datos estructurados | `Organization` + `WebSite` (home), `SoftwareApplication` + `Offer` (Pricing/Product; precios derivados de `PLAN_PRICING_CAD`), `BreadcrumbList` (todas), `BlogPosting` (blog), `VideoObject` (watch, fecha real). **No** `FAQPage`/`HowTo` para rich results: Google los restringió/retiró; solo si aportan semántica sin prometer SERP |
| Open Graph | Imagen por idioma y por tipo de página; `og:locale` `en_CA`/`fr_CA` y `og:locale:alternate` por página |
| Rendimiento | SSG; sin JS salvo búsqueda/selector; imágenes con `next/image`; medir CWV antes/después |
| Accesibilidad | Un `<h1>`; migas `nav aria-label`; foco visible; `lang` correcto por árbol de rutas |
| `llms.txt` | Opcional y barato (GABAN lo tiene); valor no demostrado **[H]**; se decide en D20 |

### 6.3 Páginas de talleres individuales (`/book/[slug]`) [H/D]
Hoy son indexables con canonical propia y metadata en francés **[V]**. Decisión de producto/SEO: ¿se permite que las páginas de cada taller compitan en Google (beneficio para el taller y para el SaaS como prueba de uso), o se `noindex` por defecto con opt-in? Riesgos: contenido duplicado entre `slug.garage-os.ca`, dominio propio y `/book/slug` (la canonical ya apunta a `bookingPublicUrl`, **[?]** confirmar con dominio propio verificado), y metadata solo en francés. No se incluyen en el sitemap de marketing. Se propone **no cambiar el comportamiento** hasta decidir (D11).

---

## 7. Investigación y priorización de keywords

**Estado de la evidencia:** sin volúmenes, KD ni CPC. Lo único observado es la *composición de los resultados* (búsqueda US-only, no geolocalizada en Canadá):

| Consulta | Qué dominó el resultado | Lectura **[H]** |
|---|---|---|
| auto repair shop management software Canada | Directorios (Capterra.ca, GetApp), listas tipo «Best … Canada 2026» (Krowdbase), CB Insights; proveedores: AutoLeap, AutoVitals, Shop Boss, ALLDATA, Protractor | Intención **comparativa**; dominan directorios y listicles → conviene aparecer en directorios y publicar una comparativa honesta propia |
| digital vehicle inspection software | Blogs/landings de proveedores: Shopmonkey, AutoLeap, Mitchell 1, Autoflow, RO Writer | Intención **comercial/informativa**; competidores grandes con contenido profundo |
| logiciel de gestion de garage automobile Québec | Editores y portales de **Francia** (Fiducial, La Fabrique du Net, lesvoitures.fr); sin editor québécois | Posible **hueco** de relevancia local (validar con SERP en Québec) |
| logiciel atelier mécanique Québec TPS TVQ … | Francia + plantilla de factura de QuickBooks (fr-ca) | Hueco en contenido TPS/TVQ para talleres |
| «GarageOS» | Sin resultado del producto; nombres similares (Garage360, Garage) | Marca sin autoridad aún |

### 7.1 Matriz (hipótesis iniciales — **no es lista definitiva**)

| Cluster | Intención | EN (hipótesis) | FR (hipótesis) | Página objetivo | Dificultad **[H]** |
|---|---|---|---|---|---|
| Categoría | Comercial | auto repair shop management software; auto repair software Canada; garage management software Canada | logiciel gestion garage automobile; logiciel de gestion de garage; logiciel garage mécanique; logiciel pour atelier mécanique; logiciel garage automobile Québec | `/` , `/product`, pilar blog | Alta (EN, incumbentes); media/desconocida (FR) |
| Agenda | Comercial/transaccional | auto repair shop scheduling software; online booking for auto repair shops | logiciel prise de rendez-vous garage | `/features/online-booking`, `/solutions/reduce-no-shows…` | Media |
| Inspección | Comercial/informativa | digital vehicle inspection software; DVI checklist | inspection numérique de véhicules | `/features/digital-vehicle-inspections` + post | Alta (EN) |
| Facturación | Transaccional | auto repair invoicing software; repair estimate software | logiciel facturation garage; devis garage | `/features/invoicing-and-payments`, `/features/quotes-and-approvals` | Media |
| Órdenes | Comercial | automotive work order software | logiciel ordre/bon de travail garage | `/features/work-orders` | Media |
| CRM/comunicación | Comercial | auto repair shop CRM; SMS appointment reminders for garages | CRM garage; rappels par texto garage | `/features/sms-and-email` | Media |
| Inventario/pneus | Comercial/informativa | shop inventory management; tire storage software | gestion inventaire garage; entreposage de pneus | `/features/inventory-and-tire-storage`, `/solutions/seasonal-tire-storage` | Media-baja |
| Comparativa | Comparativa | best auto repair shop software Canada; AutoLeap alternative | meilleur logiciel garage; alternative à … | `/compare/*` | Alta |
| Marca | Marca | GarageOS; GarageOS pricing; GarageOS login | GarageOS avis/tarifs | Home, Pricing, Help | Baja (por construir) |

**Cómo se valida (sin inventar cifras) [P]:** (1) Search Console en cuanto el sitio esté verificado: consultas reales con impresiones; (2) Google Keyword Planner / Bing Webmaster (gratis) para rangos de volumen; (3) SERP geolocalizado en Montréal/Toronto/Vancouver por una persona o herramienta con acceso; (4) opcional: herramienta de pago para dificultad. **Nada se prioriza por volumen hasta tener esos datos;** la prioridad inicial se basa en relevancia, intención y hueco competitivo observado.

Qué entra en Fase 1 sin esperar datos: términos de **categoría** y **funciones** (son la descripción literal del producto) y los de **marca**.

---

## 8. Análisis de competencia

Fuente: fragmentos de directorios y resultados de búsqueda (**secundarias**; no se pudieron abrir las páginas oficiales). Todo dato de precios/funciones debe **re-verificarse en el sitio oficial** antes de publicar una comparativa.

| Competidor | Origen / alcance (según fuentes) | Observaciones **[V en fuente citada]** | Uso en compare |
|---|---|---|---|
| **AutoLeap** | Fundada 2019, Toronto (según una fuente); US/Canadá | Capterra.ca 4.8/5 (744 reseñas); planes Essentials/Pro/Pro Plus/Multi-Shop, sin precios públicos en lo visto; integraciones (MOTOR, QBO, TireHub, etc.), DVI, SMS, reseñas Google | Candidata prioritaria |
| **Protractor** | Toronto, desde 2001; Canadá/EE. UU. | Capterra.ca 4.6/5 (37); inspección, presupuestos, POS; precio no publicado | Candidata (competidor canadiense) |
| **Shopmonkey** | EE. UU. | Capterra.ca 4.6/5 (263); precio de entrada discrepante entre fuentes (USD 199 vs 475) | Candidata |
| **Tekmetric** | EE. UU. | Capterra.ca 4.7/5 (103); desde USD 179 (Software Advice AU) | Candidata |
| **Shop-Ware** | EE. UU. | Capterra.ca 4.8/5 (162); desde USD 249 | Opcional |
| **AutoVitals** | EE. UU. | Acuerdo de distribución en Canadá con NAPA AUTOPRO; DVI exclusivo para talleres francófonos (nota de prensa) | Importante para el ángulo FR (**[H]**: confirmar en la fuente primaria) |
| **Shop Boss, ALLDATA Shop Manager, Mitchell 1 Manager SE, R.O. Writer, Fullbay** | EE. UU. | Aparecen en directorios canadienses | Contexto; sin comparativa propia por ahora |
| **Editores franceses** (Fiducial, Winmotor, EBP MéCa…) | Francia | Dominan SERP FR; no mencionan TPS/TVQ | No competidores directos; **contexto de contenido** |

**Política de comparativas [P]:**
1. Solo hechos de la **página oficial del competidor**, con URL y **fecha de verificación**; sin adjetivos denigrantes; ofrecer corrección a competidores.
2. Mostrar también **lo que GarageOS no hace** (pagos con tarjeta, API pública, calendario externo, catálogos de piezas tipo MOTOR/ProDemand — **[V]** ver `Integrations`) para que la comparativa sea creíble.
3. Sin reseñas/ratings propios inventados ni citas de clientes; los ratings de terceros solo con fuente y fecha.
4. Revisión legal liviana antes de publicar (marcas registradas, comparación honesta).
5. Actualización trimestral; cada página lleva «Última verificación».

---

## 9. Hallazgos reutilizables de GABAN Solutions

Repo: `MitchellCastellanos/GABANSolutions` (público). **Hallazgos de código [V]** vs **hipótesis [H]**:

| Área | Qué hace GABAN **[V]** | ¿Reutilizable en GarageOS? |
|---|---|---|
| Arquitectura | Sitio **HTML estático** (29 páginas) + blog dinámico en `/api/blog` desde Airtable; `cleanUrls`; secciones `/digital/*` y `/software/*` | Patrón de *divisiones por tema* sí; la tecnología no (GarageOS es Next) |
| Metadata | Cada página: `title` ≤60, `description` 70–160, canonical, `robots`, OG/Twitter completos, `og:locale en_CA`, `lang="en-CA"` | **Sí** (mismo estándar, ahora bilingüe) |
| Datos estructurados | JSON-LD con **grafo enlazado por `@id`** (`WebPage` → `WebSite` → `LocalBusiness`/Organization), `BreadcrumbList`, `FAQPage`, `BlogPosting`, `areaServed: Canada` | **Sí** el grafo por `@id` y migas; `FAQPage` solo como semántica (sin esperar rich result) |
| Indexación | `robots.txt` mínimo; **sitemap index** (páginas + blog dinámico); script que audita `title`/`description`/canonical/H1/alt/JSON-LD y **que toda página indexable esté en el sitemap** (`scripts/seo-audit.mjs`) | **Sí, y mejor:** convertirlo en **test de CI** (`tests/seo-*.test.ts`) |
| Enlaces internos | Navegación por divisiones; páginas de servicio enlazadas desde el home y entre sí | Sí, con reglas explícitas (§2) |
| Contenido | Blog con 12 posts nacionales («…in Canada») y por ciudad/categoría (Montréal); motor de temas por *categoría × Canadá* y *categoría × ciudad*; validador de posts (slug kebab, longitud, palabras prohibidas) | **Idea nacional-primero sí**; **ciudad × categoría no** (§3: sin páginas locales); validador de posts **sí** |
| Resiliencia | Snapshot JSON del blog ante caída de Airtable; caché de 1 h | No hace falta: GarageOS sirve contenido estático desde el repositorio |
| GEO / IA | `llms.txt` descriptivo; README alude a «AI SEO/GEO» | Bajo costo; efecto **[H]** |
| Anti-patrones **[V]** | Slugs con sufijo hash (`…-3bacfd38`), solo inglés, sin hreflang, sin fechas en el snapshot, precios MXN/CAD mezclados | **Evitar** |
| **Rendimiento orgánico** | **No disponible.** Sin Search Console ni analítica en el repo; el clon es de un solo commit | **No se atribuye tráfico a ninguna página ni keyword.** Pedirte, si quieres aprender de lo que funcionó, el export de Search Console de GABAN (consultas/páginas) |

Aprendizaje principal **[H]**: la combinación *nacional + temática estrecha + metadata/JSON-LD consistentes + auditoría automática* es replicable; qué página trajo tráfico, no se sabe. Y una advertencia **[V]**: `gabansolutions.ca/software/garageos` describe GarageOS en otro dominio (D10).

---

## 10. Estrategia de contenido y conversión

### 10.1 Recorridos [P]

| Recorrido | Pasos | CTA |
|---|---|---|
| Descubrimiento (EN/FR) | Búsqueda → **Blog** (educativo) → **Feature** relacionada → `/demo` o `/watch` → `/get-started` | Un CTA contextual al final; enlace natural a Pricing cuando se habla de planes |
| Comparación | Búsqueda comparativa → `/compare/*` → Feature/Pricing → `/demo` → registro | CTA «Ver la demo» + «Empezar prueba» |
| Necesidad concreta | Búsqueda de problema → `/solutions/*` → Feature → `/demo` | Igual |
| Cliente/prospecto con duda | Búsqueda de marca/«cómo» → **Help** | **Sin banners de venta**; solo avisos de plan («disponible en Pro → ver planes») |
| Venta presencial/campo | Visita → QR/enlace con UTM → `/demo` / `/fr/demo` o `/get-started` | Atribución por parámetro (§11) |

### 10.2 Reglas de conversión [P]
- **Garage Laurent** (taller ficticio, 23 capturas/idioma, `/demo`, `/demo/booking`) es el vehículo de prueba; siempre rotulado como *ejemplo ilustrativo*. **Sin testimonios, clientes, cifras de ahorro ni resultados inventados.** Los ratings de terceros no se usan.
- Videos: comerciales (`/watch`) en páginas comerciales; **nunca** como tutorial. Tutoriales reales se producen aparte.
- **Máximo un CTA contextual por artículo educativo y ninguno intrusivo en soporte.**
- Captura de interesados (opcional, D14): hoy solo registro y `mailto`. Propuesta: formulario «Solicitar demo» con consentimiento CASL explícito, que alimente el CRM como lead entrante. Es un cambio operativo → **solo con tu aprobación y revisión de cumplimiento**.

---

## 11. Plan de medición

Tres capas separadas:

| Capa | Pregunta | Herramienta propuesta | ¿Dependencia nueva? |
|---|---|---|---|
| **Técnica** | ¿Google nos indexa y entiende? | **Google Search Console** (propiedad de dominio por DNS) + **Bing Webmaster Tools**; informes de indexación, sitemap, hreflang, CWV (CrUX), enhancements de datos estructurados | No (cuentas gratuitas) |
| **Marketing** | ¿Qué consultas/páginas/idiomas traen visitas y cuáles hacen clic en la demo? | Search Console (impresiones, clics, CTR, posición por consulta/página/país/idioma) + **analítica de primera parte existente** ampliada | **No** |
| **Atribución comercial** | ¿Qué registros/demos vienen de orgánico y de qué página? | Parámetro de origen propagado por enlaces + registro en BD | No |

### 11.1 Ampliar la analítica propia (sin terceros) [P]
1. **Corregir `locale`** en `AnalyticsBeacon` (hoy fijo `"en"`) tomándolo de la ruta (`/fr/...`).
2. Clasificar **canal** en servidor a partir de `referrerHost` (orgánico: google/bing/duckduckgo/…; directo; campaña UTM; referido).
3. **Eventos mínimos** (`cta_click` con `id`: demo, signup, pricing, watch_play) por el mismo `/api/track`, sin cookies ni identificadores persistentes.
4. Dimensiones en `/platform/analytics`: idioma, tipo de página (commercial/help/blog), canal, país, top landing pages.
5. **Atribución de registro sin cookies:** los CTA hacia `/get-started` y `/admin/signup` propagan `?from=<tipo>:<id-página>&lang=<en|fr>` (y UTM si existen); al crear la cuenta, el servidor guarda un registro de origen (`landing`, `lang`, `utm_*`, `referrerHost`, fecha). Alcance: últimos pasos del embudo; **no** reconstruye historial multi-día porque `visitorHash` rota a diario. Es una limitación consciente, a cambio de no usar cookies/identificadores.
6. **Privacidad [V/P]:** el esquema actual (hash con sal diaria, sin IP) es favorable; añadir el registro de origen implica **actualizar la política de privacidad** y revisión Ley 25/LPRPDE (D13). **No** se recomienda GA4/Meta Pixel (cookies, identificadores y transferencias transfronterizas) salvo aprobación expresa.
7. Medición de video: `/api/video/*` ya mide reproducciones de correos de ventas; no mezclar con SEO; para Resources usar `watch_play` como evento propio.

### 11.2 KPIs (línea base primero; metas después de 4 semanas de datos) [P]

| Nivel | KPI | Fuente |
|---|---|---|
| Indexación | Páginas válidas/total en sitemap, por idioma; errores hreflang/canonical | Search Console |
| Visibilidad | Impresiones, clics, CTR, posición media — por consulta, página, país, idioma | Search Console |
| Calidad técnica | LCP/INP/CLS (CrUX), Lighthouse en Preview | GSC, CI |
| Tráfico | Sesiones/visitantes por canal, idioma, tipo de página, top landings | PageView ampliado |
| Intención | Clics a Demo, Watch play, Pricing → Signup | eventos propios |
| Conversión | Registros con origen orgánico; trials iniciados; (futuro) demos solicitadas | registro de origen |
| Contenido | Artículos de Help más vistos; búsquedas internas sin resultado | PageView + búsqueda |

---

## 12. Roadmap de 90 días y matriz de PRs

Reglas: **PRs pequeños y revisables; máximo 2 agentes en paralelo** (carril **A = plataforma/SEO técnico**, carril **B = contenido/páginas**); se publica por entregas completas; el calendario no retrasa lo ya terminado. Nada toca pagos, suscripciones ni permisos.

### 12.1 Matriz de PRs

| PR | Alcance | Carril | Depende de | Criterios de aceptación (resumen) |
|---|---|---|---|---|
| **PR-00** | Docs: auditoría + plan Resources + este plan | — | — | Aprobados por ti |
| **PR-01** *hotfix* | Quitar canonical global; canonical por página en marketing actual | A | confirmar [H] en HTML renderizado | Cada página declara su propia canonical; test; sin cambios visuales |
| **PR-02** *hotfix* | `robots.ts` + `noindex` en `/quote/[token]`, `/book/.../manage/[token]`, auth del `/admin/*` | A | — | robots válido; rutas con token/sesión devuelven `noindex`; tests de lista blanca |
| **PR-03** | `src/lib/seo/` (host, `buildMetadata`, JSON-LD builders, tabla de rutas) + `sitemap.ts` (EN) | A | PR-01/02 | Sitemap válido solo con rutas públicas; tests de reciprocidad y exclusiones |
| **PR-04** | **Terminología**: FR «Soumissions»→«Devis» (+ decisión *ordres/bons de travail*) solo en textos de UI/portal/emails/sitio | B | tu aprobación (D1/D2) | Cero cambios de lógica; tests de strings actualizados; glosario de términos aprobado |
| **PR-05a** | Enrutamiento por idioma: provider por URL, selector de idioma, `lang` por árbol, aviso «Voir en français» (sin auto-redirect) | A | PR-03 | `/fr/*` sirve HTML FR; selector navega a URL hermana; sin dependencia de localStorage para el HTML |
| **PR-05b** | Rutas `/fr/…` de las 12 páginas existentes + hreflang + sitemap EN/FR | A | PR-05a | Hreflang recíproco (test); ninguna página FR contiene texto EN |
| **PR-06** | Analítica: `locale` real, canal, eventos CTA, dimensiones en `/platform/analytics` | A | PR-05a | Datos por idioma/canal; privacidad documentada |
| **PR-07** | Home EN/FR: title/description/H1, `Organization`+`WebSite`+`SoftwareApplication`, desambiguación de marca | B | PR-05b | Metadata única; JSON-LD válido |
| **PR-08a/b** | Features: hub + plantilla + 11 detalles EN/FR (2 PRs) | B | PR-05b, PR-04 | Cada feature con gate de plan derivado de `CAPABILITY_MIN_PLAN`; enlaces a Help/Pricing/Demo |
| **PR-09** | Pricing: cifras SMS y excedente derivadas de constantes, FAQ de planes, `Offer` | B | PR-05b | Test impide divergencia con `PLAN_LIMITS`; sin «provisional» |
| **PR-10a/b** | Solutions: hub + 6 páginas EN/FR (2 PRs) | B | PR-08 | Cada solución enlaza ≥2 funciones reales |
| **PR-11** | Demo/Watch/Integrations: metadata, hreflang, enlaces a video, `uploadDate` real | A/B | PR-05b | Sin duplicar archivos multimedia |
| **PR-12** | Plataforma de contenido de Help (esquema, renderer, migas, TOC, relacionados) | A | PR-05b | Paridad EN/FR por tipos; claves de UI validadas |
| **PR-13** | Búsqueda de Help por idioma | A | PR-12 | Teclado/ARIA; estados vacío/sin resultados; tests por idioma |
| **PR-14a…i** | Contenido Help P0/P1 por categorías (≈8 artículos por PR): primeros pasos+citas; booking page+inspecciones; Quotes/OT/facturas/impuestos; comunicaciones+SMS; equipo+suscripción; troubleshooting; reportes/QBO/portal/multi-ubicación; glosario; privacidad/CASL (tras revisión legal) | B | PR-12 (y PR-04) | Cada afirmación con fuente en código; nombres de UI desde diccionarios; EN+FR |
| **PR-15** | Redirects `/guides/*` → Help | A | PR-14a | Test de 301 de los 13 + `/guides` |
| **PR-16** | Blog bilingüe (fechas, autor, `BlogPosting`) + migración de los 3 posts + pilar | A/B | PR-05b | Sin duplicar Help; enlaces contextuales |
| **PR-17a…** | Posts educativos en oleadas (3–4 por PR) | B | PR-16, datos de keywords | Fuentes citadas; revisión FR nativa |
| **PR-18** | Compare: hub + metodología + «vs hojas de cálculo»; competidores solo con verificación primaria | B | datos oficiales, revisión legal | Fecha de verificación visible; incluye limitaciones de GarageOS |
| **PR-19** | Changelog real (fechado) EN/FR | B | PR-05b; D7 | Fechas de merge + estado desplegado verificado |
| **PR-20** | Ayuda contextual en el panel (`HelpLink`) | A | PR-14 | Enlaces solo a artículos existentes; idioma del usuario |
| **PR-21** | Videos: bloques comerciales en Home/Features/Help; slots de tutorial | B | PR-11 | CDN verificado; sin presentar comercial como tutorial |
| **PR-22** | CI SEO: tests de metadata (longitudes, unicidad, H1), hreflang, sitemap, JSON-LD, denylist de términos internos | A | PR-03 | Falla si una página pública carece de lo anterior |
| **PR-23+** | Optimización con datos reales (títulos/CTR, enlaces internos, refrescos, expansión) | A/B | ≥4 semanas de datos | Cambios justificados por Search Console |

### 12.2 Línea de tiempo

| Ventana | Foco | PRs | Hito de salida |
|---|---|---|---|
| **Días 0–14** Fundación técnica | Canonical, robots, noindex, sitemap, utilidades SEO, terminología, enrutamiento EN/FR, analítica base, **verificar Search Console/Bing** | 00–06, 22 (parcial) | Sitio indexable y seguro; 12 páginas EN+FR con hreflang |
| **Días 15–30** SEO comercial | Home, Features (hub+11), Pricing, Solutions, Demo/Watch/Integrations | 07–11 | Cobertura comercial EN/FR completa; JSON-LD |
| **Días 31–60** Recursos y contenido | Plataforma Help + búsqueda, P0/P1, redirects, Blog, Compare (si hay datos), Changelog, videos, ayuda contextual | 12–21 | Help Center y Blog operando en EN/FR |
| **Días 61–90** Optimización | Validar indexación, CWV, consultas reales; ajustar títulos/CTR, enlaces, refrescos; ampliar contenido por datos | 22–23+ | Informe de línea base y plan de iteración |

*Por dependencias reales, PR-04 (terminología) y D7 (changelog) pueden mover contenido FR de la ventana 15–30 a la 31–60; PR-01/02 son independientes y pueden salir de inmediato.*

---

## 13. Riesgos y decisiones pendientes

### 13.1 Decisiones que necesito de ti

| ID | Decisión | Recomendación |
|---|---|---|
| D1 | Aprobar PR-04 (FR «Soumissions»→«Devis») | Sí, primero y aparte |
| D2 | «Ordres» vs «bons de travail» | Elegir uno para UI y sitio |
| D3 | Español fuera de Resources públicos | Sí; usuarios ES del panel → EN |
| D4 | URLs de Help: `/help/<cat>/<slug>` + 301 desde `/guides` | Sí |
| D5 | Rutas `/fr/` para **todas** las páginas comerciales | **Sí (ya implícito en este plan)** |
| D6 | Contenido en TS tipado vs MDX | TS tipado |
| D7 | Changelog: ¿desde ahora o desde apertura comercial? | Desde apertura (hoy sin primer cliente de pago) |
| D8 | Revisión legal de CASL/Ley 25 y de comparativas | Sí |
| D9 | PR-01/02 como hotfix inmediato | Sí |
| **D10** | **Dominio autoridad del producto**: ¿`garage-os.ca` (¿`www` o apex?) y qué se hace con `gabansolutions.ca/software/garageos` (enlazar/canonical/redirect)? | Un solo dominio autoridad; la página de GABAN enlaza a GarageOS y no duplica contenido |
| **D11** | Política de indexación de `/book/[slug]` de talleres | No cambiar hasta decidir |
| **D12** | Alcance y revisión de comparativas (qué competidores, quién verifica) | Empezar por «vs hojas de cálculo» |
| **D13** | Analítica: ampliar la propia (recomendado) vs herramienta de terceros; actualización de política de privacidad | Primera parte |
| **D14** | Formulario «Solicitar demo» con consentimiento CASL | Sí, como PR posterior |
| **D15** | Quién verifica Search Console/Bing (acceso DNS) | Tú / quien administre el DNS |
| **D16** | Presupuesto para herramienta de keywords y SERP geolocalizado | Opcional; mientras tanto, Search Console |
| **D17** | Política editorial: autoría, revisión humana, fechas reales, sin afirmaciones no verificables | Aprobar como regla |
| **D18** | Revisor nativo de francés (Québec) | Necesario |
| **D19** | Exportar de GABAN el Search Console (consultas/páginas) para aprender de datos reales | Si lo tienes |
| **D20** | `llms.txt` | Opcional, bajo costo |

### 13.2 Riesgos

| Riesgo | Mitigación |
|---|---|
| Regresión SEO al introducir `/fr` y redirects | Tabla única de rutas + tests; comparar sitemap antes/después; PRs por etapas |
| Comparativas con datos desactualizados o disputables | Solo fuentes oficiales con fecha; revisión legal; trimestral |
| Afirmaciones de SMS/facturación incompletas | Redactar solo con evidencia (Stripe LIVE en lectura) — Anexo A §6.1 |
| CASL / Ley 25 | Contenido informativo, revisado por asesoría; sin afirmar cumplimiento automático |
| Priorizar sin datos de demanda ni de dificultad | Priorizar relevancia/intención; medir con Search Console |
| Capacidad editorial (63 + ~25 páginas ×2 idiomas) | Oleadas por prioridad; no publicar contenido sin revisión |
| Analítica sin cookies = atribución limitada | Aceptarlo; parámetro de origen en el último tramo; revisar si el negocio necesita más |
| `PageView` de bots/prerender | El filtro de UA existe; revisar tras el lanzamiento |

### 13.3 Hechos a confirmar antes de implementar (todo **[?]**)

Canonical heredado en HTML real · host canónico y redirects en Vercel · Search Console/Bing activos · SERP geolocalizado de Québec · precios y funciones de competidores en fuentes oficiales · CDN de video publicado · controles CASL reales (campañas, unsubscribe, STOP) · facturación del excedente SMS en Stripe LIVE (solo lectura) · política de indexación de talleres.

---

## 14. Qué cambia respecto al Anexo A

- El glosario pasa de `/help/glossary` a `/glossary` (educativo, enlazable).
- Aparecen `/resources`, `/features/*`, `/solutions/*`, `/compare/*` y rutas FR comerciales (PR-05b, PR-08…).
- El SEO técnico (canonical, robots, sitemap, noindex, JSON-LD) se **adelanta** a la Fase de fundación en PRs separados.
- La analítica se amplía **dentro** de la infraestructura de primera parte.
- Todo lo demás (Help Center, búsqueda, 63 artículos, ayuda contextual, videos, changelog, CASL, SMS) se conserva.

## 15. Siguiente paso

Con tu aprobación del plan maestro y las decisiones D1–D5, D9, D10, D13 y D15, comienzo por **PR-01 y PR-02** (hotfixes independientes) sobre la rama `claude/resources-renovation` creada desde `origin/main`, y en paralelo preparo la verificación de las hipótesis **[?]**. No se hace merge ni deploy sin tu autorización.
