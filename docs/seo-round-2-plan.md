# Tanda 2 — plan técnico inmediato

Estado: **PLAN, sin código.** No se empieza hasta que se autorice. Base: `main` @ `007e5fe` (PR #99 y #100 integrados).
Alcance (decidido): terminología francesa · enrutamiento EN/FR · SEO técnico bilingüe · páginas comerciales prioritarias.
Fuera de esta tanda: Help Center y artículos (tanda 3), blog, comparativas, analítica ampliada y conversiones (tanda 4), Search Console y servicios externos (final, manual).

## 1. Hechos verificados que condicionan el diseño

| Hecho | Fuente | Consecuencia |
|---|---|---|
| El idioma del sitio de marketing se decide en el cliente (`MarketingLocaleProvider`: `localStorage` + `navigator.language`), con una URL por página; el HTML servido es siempre inglés | `src/components/marketing/MarketingLocaleProvider.tsx` | Para indexar francés hace falta que el servidor renderice el idioma desde la URL |
| 31 archivos usan `useMarketingLocale`; `Bilingual` elige EN o FR según el contexto | grep | Basta con que el proveedor reciba el idioma de la ruta: los componentes existentes se reutilizan sin duplicar contenido |
| `<html lang="en">` fijo en el layout raíz; el idioma real se aplica en un efecto del cliente | `src/app/layout.tsx` | Para FR se usa `lang="fr-CA"` en el contenedor y se sincroniza `document.documentElement.lang`; reestructurar en dos layouts raíz queda como opción (§6) |
| `proxy.ts` solo actúa en `/` y solo en hosts de talleres | `proxy.ts` | `/fr/**` no se ve afectado; en un dominio de taller `/fr` no existe (404), correcto |
| FR «soumission(s)»: **160 apariciones en 36 archivos**; 55 con artículo/posesivo femenino («la/une/cette/votre/notre soumission») | grep | «Devis» es masculino invariable: no basta reemplazar la palabra, hay que concordar artículos, adjetivos y participios |
| FR «ordres de travail»: 27 en 11 archivos; «bons de travail»: 44 en 15 archivos | grep | Unificar a «ordres de travail» y dejar «bon de travail» solo como sinónimo explícito |
| EN «estimate(s)» en copy público: ≈131 apariciones (marketing, home, flujos, demo) | grep | EN pasa a «Quotes»; los tests de superficie pública afirman cadenas actuales y se actualizan con el cambio |
| Áreas FR con más «soumission»: `admin-locale` (49), `marketing-pages` (19), `marketing-locale` (14), `marketing-flow` (11), `actions/quotes` (9), `demo-journey` (8), `staff-alerts` (7), `quote-approval-i18n`, `QuoteEmail`, portal | grep | Toca panel, portal, página de aprobación, correos al cliente y sitio público |
| `robots.ts` existe; **no hay `sitemap.ts`** | PR #100 | El sitemap entra en esta tanda |
| La analítica registra `locale: "en"` fijo en el cliente | `AnalyticsBeacon.tsx` | Se corrige en PR-05a para poder medir FR desde el primer día |

## 2. Orden y dependencias (2 agentes máximo)

```
Agente A (plataforma)                         Agente B (terminología / contenido)
PR-05a  Enrutamiento por idioma (base) ─┐
                                         ├─►  PR-04  Terminología (UI + público)  ── se integra primero
PR-03   Sitemap + utilidades SEO ───────┤            │
                                         └────────────┴─► PR-05b  Rutas /fr de las 12 páginas
                                                                    │
                                                          PR-07 Home · PR-09 Pricing/SMS · PR-08a Features (hub + 4)
```

- PR-04 y PR-05a no se pisan (uno cambia textos de diccionarios; el otro, proveedor, cabecera, pie y layout). Pueden ir en paralelo.
- **PR-05b depende de PR-04**: las páginas `/fr` publican copy francés y no deben nacer con «soumission».
- Todos son PRs pequeños, cada uno con Preview y verificación local; sin merge ni despliegue sin aprobación.

## 3. PRs

### PR-04 — Terminología (D1, D2, EN «Quotes»)  ·  riesgo: medio (muchos textos, pero sin lógica)
- **FR «Devis»**: 160 apariciones/36 archivos: diccionarios del panel (`src/lib/admin-locale/*`), portal (`portal-i18n.ts`), aprobación (`quote-approval-i18n.ts`), correo (`emails/QuoteEmail.tsx`), alertas (`staff-alerts.ts`), acciones con mensajes (`actions/quotes.ts`), PDF/factura (`invoice-i18n.ts`), demo (`demo-journey.ts`), sitio público (`marketing-*.ts`, `help`, `changelog`).
- **Concordancia**: revisión contextual de las 55 formas femeninas (la→le, une→un, cette→ce, aceptada→aceptado…) y de plurales («des devis»). Frases con «soumission» en otro sentido (p. ej. «faire une soumission» como oferta en general) se revisan caso a caso.
- **FR «Ordres de travail»** como término operativo; «bon de travail» solo como sinónimo explícito donde convenga (44 apariciones a revisar).
- **EN «Quotes»** en copy público (`marketing-*.ts`, componentes de marketing, home, demo, help, changelog): ≈131 apariciones; **sin tocar** las rutas de código (`/admin/quotes`, modelos).
- **ES** ya es «Cotizaciones» (sin cambios); se verifica.
- Lo que **no** cambia: nombres de modelos/enums, rutas, claves de diccionario, lógica.
- **Método**: script de inventario (archivo:línea) → cambios por lotes con revisión → test que falla si reaparece «soumission» fuera de una lista permitida, y un test de concordancia (regex de artículos/posesivos + devis).
- **Validación**: `tsc`, ESLint, `npm test` (actualiza `public-surface.test.ts`), capturas de pantallas clave en FR (lista de cotizaciones, detalle, página de aprobación, correo renderizado, portal, PDF), revisión de lectura por una persona de Québec.
- **Aceptación**: cero «soumission» FR y cero «estimate» EN en copy de usuario (salvo lista justificada); sin cambios funcionales (diff solo de cadenas y tests).

### PR-05a — Enrutamiento por idioma (base)  ·  riesgo: medio
- `src/lib/seo/routes.ts`: tabla única `id → { en, fr }` con todas las páginas públicas y helpers `localizePath()` / `alternatePath()`; test de reciprocidad y unicidad.
- `MarketingLocaleProvider` recibe `locale` de la ruta (render de servidor en el idioma correcto); `localStorage` solo recuerda la preferencia para **prellenar el selector**, nunca decide el HTML.
- `LanguageToggle` pasa a **enlaces** a la URL hermana (hoy cambia estado); `MarketingHeader`/`MarketingFooter` generan enlaces localizados.
- Sin redirección automática por idioma del navegador: aviso discreto «Voir cette page en français» para navegadores francófonos (reemplaza el cambio silencioso actual).
- `lang="fr-CA"` en el contenedor FR y sincronización de `document.documentElement.lang`.
- `AnalyticsBeacon`: `locale` derivado de la ruta (`/fr/…` → `fr`).
- Sin cambios de URL inglesas ni redirects: **ninguna URL existente cambia**.
- **Validación**: tests de la tabla de rutas y del proveedor; build; recorrido manual EN→FR→EN; verificación de que el HTML de una ruta `/fr` ya sale en francés (curl sin JS).

### PR-03 — Sitemap y utilidades SEO  ·  riesgo: bajo
- `src/app/sitemap.ts` generado desde la tabla de rutas: solo URLs públicas indexables, `alternates.languages` (en-CA, fr-CA, x-default→EN), `lastModified` real; filtrado por `isPrivatePath` (ya probado por test).
- `robots.ts`: añade `Sitemap: https://www.garage-os.ca/sitemap.xml`.
- `pageMetadata()` ampliado: acepta `locale` y genera `alternates.languages`, `og:locale` y `og:locale:alternate` correctos.
- **Validación**: test de sitemap (sin rutas privadas, pares recíprocos, URLs absolutas con el host autoridad); build; comprobación del XML renderizado.

### PR-05b — Rutas `/fr` de las 12 páginas existentes  ·  riesgo: medio
- `/fr`, `/fr/produit`, `/fr/fonctionnalites`, `/fr/tarifs`, `/fr/integrations`, `/fr/demo`, `/fr/commencer`, `/fr/demarrage-rapide`, `/fr/a-propos`, `/fr/contact`, `/fr/confidentialite`, `/fr/conditions`, `/fr/nouveautes`, `/fr/aide` (la parte de Help sigue en tanda 3; aquí solo la página actual).
- Cada archivo es fino: reutiliza los componentes existentes con `locale="fr"`, metadata FR (título, descripción, canonical, hreflang) y `/watch/fr` ya existente.
- Contenido de About/Contact/Privacy/Terms que hoy alterna con condicionales `fr ?` se verifica para que la ruta FR no muestre inglés.
- **Validación**: test «cada página FR no contiene texto del diccionario EN» (comparación contra las cadenas EN); crawl de las 28 URLs (EN+FR) comprobando título, canonical, hreflang recíproco, un `<h1>`, `lang`; Preview.

### PR-07 — Home EN/FR  ·  PR-09 — Pricing con SMS  ·  PR-08a — Features (hub + 4 páginas)  ·  riesgo: bajo/medio
- **Home**: título/descripción/H1 propios por idioma; JSON-LD `Organization` + `WebSite` + `SoftwareApplication` (precios desde `PLAN_PRICING_CAD`); desambiguación de marca («GarageOS — logiciel de gestion de garage / auto repair shop software»).
- **Pricing**: tabla de SMS **derivada de constantes** (`PLAN_LIMITS.smsSegmentsPerMonth`: 300/1 000/2 500; `SMS_OVERAGE_PRICE_CAD_PER_SEGMENT`: $0.05), explicación de segmentos, mes calendario UTC, alertas 80 %/100 %, «el envío no se bloquea»; `Offer` JSON-LD. Los textos de facturación del excedente (cuándo aparece en factura, trial, impuestos) **solo se publican con evidencia confirmada** (pendiente: lectura de Stripe LIVE, §5).
- **Features**: hub renovado + 4 páginas de detalle (reservas en línea, inspecciones digitales, cotizaciones y aprobaciones, SMS y correo/recordatorios) con insignia de plan derivada de `CAPABILITY_MIN_PLAN`, enlaces a Help (existente), Pricing y Demo. Las 7 restantes y las páginas de soluciones van en la siguiente ola.
- Reglas de conversión: un CTA contextual por página, Garage Laurent como ejemplo rotulado, sin testimonios ni cifras inventadas.
- **Validación**: tests de paridad EN/FR y de gates de plan, JSON-LD parseable, unicidad de títulos/descripciones y longitudes (≤60/≤155), enlaces internos válidos.

## 4. Criterios de aceptación de la tanda
1. Ninguna URL inglesa existente cambia ni se rompe; sin redirects nuevos.
2. Las 14 URLs `/fr` devuelven HTML en francés **sin JavaScript** (verificado con curl), con canonical propio y hreflang recíproco (en-CA, fr-CA, x-default).
3. `sitemap.xml` válido, con pares EN/FR, sin rutas privadas; `robots.txt` lo referencia.
4. Cero «soumission» (FR) y «estimate» (EN) en copy de usuario salvo lista justificada; «Devis»/«Ordres de travail»/«Quotes» consistentes con la interfaz.
5. `tsc`, ESLint, `npm test`, `next build` en verde; Preview READY; verificación en producción tras cada merge aprobado.
6. Sin cambios en permisos, pagos, suscripciones, autenticación ni procesos operativos.

## 5. Pendientes de verificación antes de redactar (no bloquean el código)
- **Excedente SMS en Stripe LIVE** (solo lectura): Price de 5¢, cuándo aparece en factura (mensual vs anual), tratamiento durante el trial y de impuestos. Hasta confirmarlo, Pricing publica cifras y comportamiento ya verificados en código, y omite el detalle de facturación del excedente.
- **Dónde ve el taller el cargo del excedente** (factura de Stripe / portal): confirmar.
- Revisión de francés por una persona de Québec (antes de cada merge de contenido FR).

## 6. Decisiones que necesito antes de empezar
1. **Slugs FR** propuestos en PR-05b: `produit`, `fonctionnalites`, `tarifs`, `integrations`, `demo`, `commencer`, `demarrage-rapide`, `a-propos`, `contact`, `confidentialite`, `conditions`, `nouveautes`, `aide`. ¿Aprobados?
2. **Aviso «Voir en français»** (sin redirección automática): ¿lo implementamos como banner discreto o solo como el selector de idioma?
3. **`<html lang>`**: contenedor `lang="fr-CA"` + sincronización (recomendado, bajo riesgo) frente a dos layouts raíz por grupo de rutas (más limpio, pero mueve gran parte de `src/app`). ¿Mantenemos la opción de bajo riesgo?
4. **Revisor de francés**: ¿quién revisa PR-04 y PR-05b antes del merge?
5. **Orden de las 4 páginas de Features** del PR-08a (propuesta: reservas, inspecciones, cotizaciones/aprobaciones, SMS y correo).

## 7. Riesgos
| Riesgo | Mitigación |
|---|---|
| Errores de concordancia/idioma en PR-04 | Inventario línea a línea, tests de patrón, revisión nativa, capturas |
| Duplicar contenido en `/fr` | Los componentes se reutilizan con el idioma de la ruta; test de «sin texto EN en rutas FR» |
| Regresión SEO al tocar cabecera/pie/selector | Las URLs EN no cambian; tests de tabla de rutas; crawl antes/después |
| Build de Vercel con fallo intermitente de la fuente Oswald (visto en el Preview del PR #100) | Un único reintento del mismo commit; si se repite en `main`, se investiga aparte; no se hace commit vacío |
| `public-surface.test.ts` afirma cadenas actuales | Se actualiza junto con PR-04, no se debilita |
