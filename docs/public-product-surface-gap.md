# Auditoría: producto vs superficie pública

**Corte: 2026-09-13**

GarageOS llegó al punto inverso al auditado originalmente: el producto implementado y el alcance de V1 ya son considerablemente más amplios que lo que comunican el homepage, Features, Demo, Help Center, Guides y otras superficies públicas.

La superficie pública actual todavía presenta principalmente un flujo de:

> appointments → estimates → invoices + communications

El producto que se está cerrando cubre un flujo mucho más completo:

> booking → customer/vehicle → appointment → estimate → approval → Work Order → DVI/work → job status → invoice/payment → history → maintenance reminder

alrededor del cual también existen o están contemplados inventory, communications/campaigns, branding, reports, multi-location, tire storage, data migration y accounting-light/QuickBooks.

El gap ya no consiste solamente en agregar nombres de features. La web pública todavía no explica GarageOS como un sistema operativo completo para el flujo diario de un taller independiente.

---

## Homepage `/`

El homepage actual está compuesto por Hero, FeatureStrip, ToolsSection, BrandControlSection, BuiltForSection, Testimonials, PricingSection y CTA.

La metadata y el hero resumen GarageOS principalmente como appointments, work orders, invoicing y customer communication. El feature strip agrega vehicle history, inventory, reports y branding. Tools ya menciona digital inspections y service reminders, pero estas capacidades aparecen como elementos secundarios y no como parte de un workflow coherente.

### Gap

El homepage subrepresenta online/front-desk booking, customer/vehicle history, customer approval, Work Orders como ejecución real, DVI con media/findings, job status, Ready for Pickup, maintenance reminders, inventory, campaigns, multi-location, reports, branded communications y custom domains. También quedará por incorporar Tire Storage, data migration y accounting-light/QuickBooks cuando existan.

La narrativa actual es una colección de herramientas. El producto final se entiende mejor como cinco resultados conectados: **Bring the job in** (booking/customers/vehicles/schedule), **Inspect & get approval** (DVI/estimates/approval), **Run the work** (Work Orders/parts/status/team), **Get paid & keep records** (invoice/payment/history) y **Bring customers back** (reminders/campaigns/communications). Inventory, reports, multi-location e integrations forman la capa de management/growth.

### Inconsistencias encontradas

- El invoice mockup todavía contiene un VIN ficticio aunque VIN fue eliminado del alcance.
- El dashboard mockup/nav refleja una versión anterior de las capacidades.
- DVI y Ready for Pickup tienen muy poco protagonismo.
- “Estimates” no explica suficientemente el approval trail.
- El posicionamiento no deja claro que GarageOS está pensado principalmente para owner/front desk/service advisor y no requiere un Work Board complejo.
- Los testimonials actuales parecen testimonios reales aunque no hay evidencia en el repo de que lo sean.
- “Join hundreds of garages already running on GarageOS” es un claim no sustentado por el estado conocido del producto.

---

## Features `/features`

La página actual solo presenta Appointments & scheduling, Work orders & estimates, Invoicing & payments, Customer communication, Vehicle history & records, Service & parts lines, Reports & insights y Branding.

Esto ya no representa el producto. Una cobertura fiel tendría que incluir además approval flow, DVI/media, Work Orders como flujo propio, job status/Ready for Pickup, inventory, maintenance reminders, campaigns, multi-location y sending-domain configuration; y posteriormente Tire Storage, QuickBooks/accounting-light y data migration.

La cuadrícula plana actual tampoco muestra cómo se relacionan estas capacidades. El producto se presta más a categorías como Schedule & customers, Inspect & authorize, Run the job, Communicate & retain e Invoice & manage.

---

## Product

Actualmente no existe una página pública `/product` real. Esto deja un hueco entre el homepage y `/features`: no hay una superficie dedicada a explicar **cómo funciona GarageOS como sistema**.

El flujo central es: customer books/front desk schedules → vehicle arrives → inspection/estimate → customer approval → Work Order → job status → Ready for Pickup → invoice/payment → vehicle history → maintenance reminder.

También falta una explicación pública clara de que GarageOS está pensado para front desk/owner sin obligar al técnico a operar software complejo; que el cliente recibe una experiencia branded (booking, approvals, inspection results, notifications, documents); y que inventory, reports y multi-location forman una capa de management alrededor del job.

---

## Demo `/demo`

El Demo actual contiene solo cuatro pasos: appointment, client/vehicle, estimate e invoice/payment. Representa el flujo viejo y termina justo donde ahora empieza buena parte del valor diferencial.

Faltan check-in/contexto del vehículo, DVI, findings/evidencia, customer approval real, Work Order, status, waiting for parts/approval cuando aplique, Ready for Pickup, customer notification, vehicle history y maintenance reminder.

El Demo actual es principalmente textual. El producto ya tiene suficiente profundidad para representar visualmente el ciclo completo de un vehículo y la relación entre las pantallas.

---

## Quick Start

No existe una ruta `/quick-start` ni una experiencia equivalente completa. El onboarding está repartido entre Help y Guides, pero no existe un recorrido corto desde una cuenta nueva hasta el primer flujo completo.

El flujo natural sería: shop identity/locale/timezone/business details → hours/online booking → team → customer/vehicle (o import cuando exista) → appointment → estimate/approval → Work Order → DVI → status/customer notifications → invoice/payment → maintenance reminder, dejando inventory, communications/domain y additional locations como configuración adicional.

---

## Help Center `/help`

Help actualmente ofrece cuatro guides y diez FAQs, concentrados en setup, booking, clients/vehicles, estimate→invoice, delivery y roles.

La documentación tiene poca o ninguna cobertura de: Quick Start, import/migration, maintenance reminders, approval trail, Work Orders, DVI, Ready for Pickup/status notifications, communications/domain configuration, campaigns, inventory movements/integration, Tire Storage, Reports, multi-location y QuickBooks futuro.

Con este crecimiento, Help también empezará a necesitar una taxonomía más clara y eventualmente búsqueda/filtering.

---

## Guides `/guides`

Actualmente solo existen cuatro guías principales: shop/team setup, online booking, clients/vehicles y estimate→invoice.

Faltan guías para estimate→Work Order, DVI, DVI findings→estimate, job status/customer notifications, maintenance reminders, inventory/stock movements, multi-location, branded email/domain communications, approval history y completed-job/end-of-day workflow. Posteriormente también harán falta data import/migration, seasonal tire storage y QuickBooks.

---

## Blog / Resources

Los recursos actuales están centrados en operaciones básicas, estimates y vehicle records. El producto ya abre temas más fuertes para adquisición y educación: reducción de front-desk admin, digital inspections/customer clarity, estimate approvals, maintenance retention, migración desde papel/spreadsheets, inventory discipline, multi-location y branded communication.

El Blog no necesita duplicar Help; su gap es que todavía no refleja los problemas de negocio que ahora resuelve GarageOS.

---

## Integrations `/integrations`

La página actual presenta Resend, Twilio y Google Drive como integrations. En buena medida son infraestructura técnica de GarageOS, no necesariamente conexiones que un shop owner percibe o elige como “integraciones”.

Hay una diferencia conceptual entre native GarageOS capabilities (email/SMS/document delivery), shop-facing integrations que el taller decide conectar (por ejemplo QuickBooks cuando exista) y future connections como calendar sync, payment processing o API.

Google Drive también merece una nueva revisión de posicionamiento según cuánto de esa integración sea realmente visible/configurable para el usuario final.

---

## Pricing y packaging

Starter / Pro / Business fueron definidos alrededor de un producto anterior y ya no cubren explícitamente muchas capacidades de la V1 final.

El pricing público todavía no responde cómo se empaquetarán DVI, maintenance reminders, SMS usage, inventory, Tire Storage, reports, multi-location, custom domain/branding, QuickBooks, data migration y user limits. Esto no implica que todas deban separarse por tiers; significa que el pricing actual ya no describe suficientemente qué compra el cliente.

---

## Claims y consistencia global

Se identificaron estos riesgos/inconsistencias a través de las superficies públicas:

- VIN todavía aparece después de haber sido eliminado del alcance.
- Algunas descripciones antiguas de Work Orders describen en realidad estimate→invoice.
- Cierto copy puede implicar card processing aunque GarageOS actualmente registra pagos externos.
- Existen customer-count/traction claims no sustentados.
- Testimonials se presentan como reales sin evidencia de que lo sean.
- Parte del wording sigue siendo single-shop pese a multi-location.
- API sigue siendo futura.
- Two-way SMS no forma parte de V1.
- Purchase Orders/Suppliers no forman parte del alcance actual.
- Full accounting no forma parte del producto; accounting-light/QuickBooks es la dirección futura.
- Work Board/kanban no forma parte del workflow deseado.
- EN/FR no es consistente en todas las superficies editoriales públicas.

---

## Estado general del gap

La web pública no está rota ni vacía; simplemente quedó una generación atrás del producto.

**La web todavía vende un conjunto de herramientas administrativas. GarageOS ya está evolucionando hacia un flujo operativo completo del taller, desde la reserva hasta la próxima visita del cliente.**

Las superficies con mayor distancia respecto al producto son aproximadamente: Demo, Features, Help/Guides, Homepage, ausencia de Product, ausencia de Quick Start, Integrations, Pricing/packaging y Blog/resources.

Una vez cerrado este gap, el sitio público debería dejar claro qué es GarageOS, para quién está construido, qué ocurre desde booking hasta completed job, cómo funcionan inspection y approval, cómo se comunica Ready for Pickup, qué ocurre después del pago, cómo se genera la siguiente visita, qué herramientas administran el negocio completo y qué capacidades existen hoy frente a las que siguen siendo futuras.
