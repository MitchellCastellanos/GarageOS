# Auditoría: producto real/planeado vs superficie pública

**Fecha del corte:** 2026-09-13

## Propósito

GarageOS llegó al punto inverso al auditado originalmente: el producto implementado y el alcance de V1 ahora son más amplios que lo que explican el homepage, Features, Demo, Help Center, Guides y otras superficies públicas.

Este documento define el gap para poder repartir el trabajo entre agentes sin que cada agente tenga que reinterpretar el roadmap completo.

Fuentes de verdad para esta auditoría:

- código actual en `src/app/admin`, `src/actions` y `prisma/schema.prisma`;
- `docs/roadmap.md`;
- `docs/feature-gap.md`;
- `docs/communications-platform.md`;
- superficies públicas actuales en `src/app/**` y `src/lib/marketing-*`.

Regla editorial: **no publicar como disponible una función que solo esté planeada o en un PR no validado.** Se puede preparar copy/componentes para funciones inminentes, pero el merge público debe reflejar el estado real del producto en ese momento.

---

# 1. Resumen ejecutivo

La superficie pública actual todavía vende principalmente este producto:

> appointments → estimates → invoices + communications

La V1 que estamos construyendo se parece más a:

> booking → customer/vehicle → appointment → estimate → approval → Work Order → DVI/work → job status → invoice/payment → history → maintenance reminder

con inventory, multi-location, branded communications, campaigns, reports, tire storage, data migration y accounting-light/QuickBooks alrededor de ese flujo.

El problema ya no es solo que falten nombres de features. Falta **explicar el sistema como un flujo operativo completo**. La actualización debe cambiar tanto el contenido como la jerarquía de marketing y documentación.

## Gaps más importantes

1. Homepage demasiado superficial para el producto actual/final.
2. `/features` solo muestra ocho cards y ya subrepresenta fuertemente GarageOS.
3. `/demo` termina en invoice/payment y omite approval real, Work Orders, DVI, job status, Ready for Pickup, history y retention.
4. Help Center y Guides documentan solo setup, booking, clients/vehicles y estimate→invoice.
5. No existe una verdadera página `/product`; el nav `Product` depende principalmente del homepage/anchors y Features.
6. No existe un verdadero Quick Start de producto; el contenido de getting started está repartido entre Help y Guides.
7. Integrations refleja infraestructura vieja/actual, pero deberá evolucionar para accounting-light/QuickBooks y distinguir claramente native capability, provider infrastructure e integrations de terceros.
8. Pricing/tier copy todavía fue escrito para un scope anterior y deberá revisarse cuando se cierre qué feature pertenece a cada plan.
9. El marketing todavía contiene referencias a VIN aunque VIN fue eliminado explícitamente del alcance.
10. Recursos editoriales no cubren las nuevas razones para comprar GarageOS: inspections, approvals, status communication, maintenance retention, inventory, multi-location, shop branding y operational visibility.

---

# 2. Inventario de superficies públicas auditadas

## Homepage `/`

Actualmente compuesto por:

- Hero
- FeatureStrip
- ToolsSection
- BrandControlSection
- BuiltForSection
- Testimonials
- PricingSection
- CTA

La metadata y el hero resumen GarageOS como appointments + work orders + invoicing + customer communication. El feature strip añade vehicle history, inventory, reports y branding. Tools menciona digital inspections y service reminders, pero sin explicar el workflow ni darles suficiente peso.

### Gap

El homepage debe evolucionar de una lista genérica de herramientas a una historia clara del ciclo completo del taller.

Debe representar, una vez implementadas/validadas:

- online + front-desk booking;
- customer/vehicle CRM and history;
- estimates + explicit customer approval;
- Work Orders;
- DVI with photos/findings;
- job/vehicle status;
- optional Ready for Pickup notifications;
- invoices/payments;
- maintenance reminders;
- inventory/parts;
- campaigns/communications;
- multi-location;
- reports/operational visibility;
- branding/custom domains;
- tire storage cuando exista;
- migration/import cuando exista;
- accounting-light/QuickBooks cuando exista.

### Cambio de narrativa recomendado

No convertir el home en una lista de 25 features. Organizarlo alrededor de aproximadamente cinco outcomes:

1. **Bring the job in** — booking, clients, vehicles, schedule.
2. **Inspect & get approval** — DVI, estimates, approval trail.
3. **Run the work** — Work Orders, parts, status, team.
4. **Get paid & keep records** — invoices, payments, taxes, history.
5. **Bring customers back** — reminders, campaigns, branded communications.

Después mostrar management/growth: inventory, reports, multi-location, integrations.

### Correcciones concretas

- Eliminar el VIN ficticio de la invoice mockup y cualquier otro VIN-oriented marketing copy.
- Actualizar dashboard mockup/nav para que refleje la navegación real cuando Work Orders/DVI/reminders estén merged.
- Dar protagonismo visual a DVI y Ready for Pickup; son features fáciles de entender y vender.
- Explicar approval trail en vez de decir solamente “estimates”.
- Explicar que GarageOS es front-desk/owner friendly; no vender un complejo technician board que no queremos construir.
- Revisar testimonials. No usar testimonios ficticios como evidencia de clientes reales si no lo son; convertirlos a claramente illustrative/sample o reemplazarlos con testimonios reales cuando existan.
- Revisar “Join hundreds of garages...” y cualquier otra cifra/claim no sustentado antes del lanzamiento.

---

# 3. `/features` — gap crítico

La página actual solo cubre:

- Appointments & scheduling
- Work orders & estimates
- Invoicing & payments
- Customer communication
- Vehicle history
- Service & parts lines
- Reports
- Branding

Esto ya es insuficiente.

## Arquitectura recomendada

En vez de una cuadrícula plana de cards, convertir `/features` en un catálogo por workflow/categoría.

### Schedule & customers

- Online booking
- In-person appointments
- Clients
- Vehicles
- Vehicle/service history
- Team/mechanic assignment

### Inspect & authorize

- Estimates
- Customer approval flow
- DVI
- Photos/media
- Findings → estimate lines

### Run the job

- Work Orders
- Job status
- Ready for Pickup
- Parts/labour lines
- Inventory
- Tire Storage (cuando esté implementado)

### Communicate & retain

- Email/SMS notifications
- Maintenance reminders
- Campaigns
- Branded communications
- Own sending domain/configuration where supported

### Invoice & manage

- Invoices
- Payments/receipts
- Taxes
- Reports
- Multi-location
- Accounting-light/QuickBooks (cuando exista)
- Data import/migration (cuando exista)

Cada feature importante debe tener suficiente explicación para que el prospecto entienda el outcome, no solo el nombre técnico.

---

# 4. `/product` — falta una superficie central

Actualmente no existe `src/app/product` como página real.

Crear una página Product que explique **cómo funciona GarageOS como sistema**, mientras `/features` responde **qué incluye**.

## Estructura recomendada

Hero: “One system from booking to the next visit.”

Workflow visual:

1. Customer books / front desk schedules.
2. Vehicle arrives.
3. Shop inspects and prepares estimate.
4. Customer approves.
5. Work Order organizes the job.
6. Shop updates status / customer gets Ready notification.
7. Invoice + payment.
8. History is retained.
9. GarageOS schedules the next maintenance reminder.

Secciones adicionales:

- Built for front desk + shop owner, without forcing technicians into complicated software.
- Customer-facing experience: branded booking, approvals, DVI results, notifications, documents.
- Management layer: inventory, reports, multi-location.
- Quebec/Canada readiness: bilingual workflow and configurable tax/business settings, without making unsupported compliance claims.

Product debe ser la mejor página para que un dueño de taller entienda GarageOS en 2–3 minutos.

---

# 5. `/demo` — actualmente demasiado corto

Demo actual tiene cuatro pasos:

1. appointment;
2. client/vehicle;
3. estimate;
4. invoice/payment.

Eso representa la versión vieja del producto.

## Nuevo Demo recomendado

Crear un walkthrough realista de un solo vehículo:

1. **Booking / check-in** — customer + vehicle + appointment.
2. **Inspection** — DVI descubre brakes/tires/etc.
3. **Estimate** — hallazgos se convierten en propuesta.
4. **Customer approval** — mostrar el flujo público/token y audit trail.
5. **Work Order** — trabajo autorizado pasa a ejecución.
6. **Status update** — waiting parts/in service/ready.
7. **Ready for Pickup** — customer notification opcional.
8. **Invoice + payment** — cerrar el trabajo.
9. **Vehicle history** — todo queda ligado al vehículo.
10. **Maintenance reminder** — preparar próxima visita.

El demo debe ser una de las piezas de venta principales, no solo una lista textual. Idealmente usar screenshots/mockups del producto real y CTAs hacia Quick Start/Features/Get Started.

---

# 6. Quick Start — falta como experiencia propia

No existe una ruta `/quick-start` actual.

Crear un **Quick Start** pensado para un dueño/manager que acaba de crear una cuenta.

## Objetivo

Que un taller pueda llegar de signup a “primer flujo completo” sin leer documentación extensa.

## Quick Start propuesto

1. Configure shop identity, locale/timezone and business details.
2. Configure opening hours + online booking.
3. Add/invite team.
4. Add or import first customer/vehicle.
5. Create first appointment.
6. Create/send first estimate and understand approval.
7. Create/use Work Order.
8. Run first DVI.
9. Update status / configure customer notifications.
10. Invoice and record payment.
11. Create a maintenance reminder.
12. Optional: configure inventory, communications/domain and additional location.

Debe incluir deep links a la pantalla administrativa correspondiente y links a guías detalladas.

Cuando Data Import exista, Quick Start debe ofrecer **Import existing data** como alternativa a crear records manualmente.

---

# 7. Help Center — documentación muy por detrás

Help actual enlaza cuatro guides y diez FAQs. El contenido está concentrado en booking, client records, estimates/invoices, delivery y roles.

## Nueva taxonomía recomendada

### Getting started

- Create your shop
- Quick Start
- Shop settings
- Team & permissions
- Import/migration

### Customers & vehicles

- Client records
- Vehicles
- History
- Maintenance reminders

### Scheduling

- Appointments
- Online booking
- Availability
- Notifications

### Estimates & approvals

- Create/send estimates
- Customer approval
- Changes after approval
- Approval audit trail

### Work Orders

- Create/open a Work Order
- Status lifecycle
- Assign work
- Parts/labour
- Complete/cancel

### Digital inspections

- Start DVI
- Conditions/findings
- Photos/media
- Findings → estimate
- Customer inspection view

### Invoices & payments

- Invoice lifecycle
- Payment recording
- Receipts
- Taxes
- Corrections/refunds where supported

### Communications

- Email/SMS
- Sender/domain configuration
- Ready for Pickup
- Maintenance reminders
- Campaigns
- Delivery troubleshooting

### Inventory & tire storage

- Inventory
- Stock adjustments/movements
- Work/invoice integration
- Tire Storage when available

### Reports & locations

- Dashboard/reports
- Multi-location
- Access between locations

### Integrations

- QuickBooks when available
- Email/SMS infrastructure as relevant to administrators

Help should gain search/filtering if the article count grows materially. Do not build a heavyweight docs platform prematurely; the current in-app/static architecture can be extended first.

---

# 8. Guides / Resources — content gap

Current guides only cover:

1. shop/team setup;
2. online booking;
3. clients/vehicles;
4. estimate→invoice.

## Guides to add

High priority after corresponding product features are merged:

- Run a job from estimate to Work Order
- Perform a Digital Vehicle Inspection
- Turn DVI findings into an estimate
- Configure job-status customer notifications
- Set up and manage maintenance reminders
- Manage inventory and stock movements
- Use multi-location GarageOS
- Configure branded email/domain communications
- Understand customer approval history
- End-of-day workflow / close completed jobs

Later:

- Import your existing shop data
- Manage seasonal tire storage
- Connect GarageOS with QuickBooks

## Blog/resources strategy

Blog should support acquisition, not duplicate Help. Potential clusters:

- reducing front-desk admin;
- how digital inspections improve customer clarity;
- estimate approval best practices;
- maintenance reminders and repeat business;
- migrating from paper/spreadsheets;
- running a multi-location independent garage;
- inventory discipline for small shops.

Avoid invented statistics or ROI claims unless sourced.

---

# 9. Integrations page

Current page presents Resend, Twilio and Google Drive as “integrations”. These are partly implementation infrastructure rather than necessarily integrations a normal shop owner chooses.

## Recommended distinction

### Native GarageOS capabilities

Email/SMS/document delivery should generally be marketed by capability, not force customers to understand the underlying provider unless they actually configure their own account.

### Shop-facing integrations

Reserve `/integrations` primarily for connections the shop intentionally connects, e.g. QuickBooks Online when implemented.

### Coming later

External calendar, payments, public API, etc. should only appear when useful and clearly labeled; avoid a large graveyard of “coming soon”.

Re-audit Google Drive positioning against actual user-facing behavior before keeping it prominent.

---

# 10. Pricing / packaging gap

The homepage currently packages Starter/Pro/Business around an older feature set.

Before launch, pricing needs a dedicated pass after the new capabilities are stable.

Questions to settle:

- Which plans receive DVI?
- Which receive automated maintenance reminders?
- SMS allowance/cost model?
- Inventory tier?
- Tire Storage tier?
- Reports tier?
- Multi-location remains Business?
- Custom domain/branding tier?
- QuickBooks tier/add-on?
- Data import included during onboarding or paid migration?
- User limits vs unlimited users?

Do not let agents independently invent plan entitlements while refreshing pages. Keep pricing as its own decision/workstream.

---

# 11. Claims and consistency audit

A dedicated agent should scan every public route and shared marketing dictionary for contradictions.

Must catch at minimum:

- VIN references after VIN removal.
- Features labeled available before their implementation is merged/validated.
- Old Work Order descriptions that actually describe estimate→invoice rather than real Work Orders.
- Payment copy that could imply GarageOS processes cards when it only records them.
- Unsupported customer counts, testimonials or performance claims.
- Old “single shop” wording now that multi-location exists.
- API wording: still future.
- Two-way SMS: do not imply it exists.
- Purchase Orders/Suppliers: do not market them.
- Full accounting: do not imply it exists; position QuickBooks/accounting-light only when implemented.
- Work Board/kanban: do not imply it is part of the intended workflow.
- EN/FR consistency across core public marketing surfaces.

---

# 12. Recommended agent work packages

These packages are intentionally separable so multiple agents can work without heavily overlapping files.

## Agent A — Homepage repositioning

Scope:

- `src/app/page.tsx`
- `src/components/marketing/Hero*`
- FeatureStrip / Tools / BrandControl / BuiltFor / related home components
- `src/lib/marketing-locale.ts`

Goal: rewrite/restructure homepage around the full GarageOS workflow and current product positioning. Remove stale VIN/unsupported claims. Preserve brand system and responsive quality.

Dependencies: final public copy for in-progress features should merge only after those features are validated.

## Agent B — Product + Features

Scope:

- create `/product`;
- overhaul `/features`;
- shared marketing components required only by these pages.

Goal: Product explains workflow; Features provides comprehensive categorized capability catalog.

## Agent C — Demo

Scope: `/demo` and demo-specific components/assets.

Goal: turn Demo into a realistic booking→DVI→approval→WO→status→invoice→history→reminder walkthrough.

Prefer real product UI/screenshots or faithful UI mockups rather than generic illustrations.

## Agent D — Quick Start

Scope:

- create `/quick-start`;
- update resource navigation where appropriate.

Goal: actionable onboarding path from new shop to first completed workflow, with deep links into admin.

## Agent E — Help + Guides

Scope:

- `/help`;
- `/guides`;
- `src/lib/marketing-resources.ts`;
- related resource components.

Goal: expand docs taxonomy and guides to cover the real product. Keep content operational and factual.

## Agent F — Integrations + pricing consistency

Scope:

- `/integrations`;
- pricing marketing surfaces;
- relevant copy dictionaries.

Goal: distinguish native infrastructure from true shop integrations and flag pricing decisions rather than inventing entitlements. QuickBooks copy waits for implementation.

## Agent G — Global public-site consistency/QA

Run after A–F.

Scope: all public routes, metadata, nav/footer, dictionaries and shared components.

Goal:

- remove stale contradictions;
- EN/FR consistency;
- responsive/mobile audit;
- internal links;
- metadata/SEO;
- accessibility basics;
- no unsupported claims;
- build/lint/typecheck/tests;
- public-route smoke test.

This agent should not redesign the product; it is the final integration/editorial QA pass.

---

# 13. Suggested execution order

Parallelizable first wave:

- A Homepage
- B Product + Features
- C Demo
- D Quick Start
- E Help + Guides

Second wave after product features/entitlements settle:

- F Integrations + Pricing

Final:

- G Global consistency/QA

Agents should read `docs/roadmap.md`, `docs/feature-gap.md` and this document before editing. They should inspect actual code before making availability claims.

---

# 14. Definition of done for this marketing/docs catch-up

The catch-up is complete when a prospect and a new shop owner can answer these questions from the public site without guessing:

1. What is GarageOS?
2. Who is it built for?
3. What happens from booking to completed job?
4. How does inspection and customer approval work?
5. How does the shop communicate job status/Ready for Pickup?
6. What happens after the invoice is paid?
7. How does GarageOS help bring the customer back?
8. What management tools exist beyond the individual job?
9. What is included today vs coming later?
10. How do I get started and learn the product?

The public site should no longer be merely accurate. It should make the breadth and coherence of GarageOS obvious without overwhelming a small independent shop owner.
