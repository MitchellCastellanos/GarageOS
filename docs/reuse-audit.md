# Auditoría de reutilización

Origen: [MitchellCastellanos/Mecanico_Management](https://github.com/MitchellCastellanos/Mecanico_Management), rama `main`, commit `f20b31594487bd8e68946135e8d35873c76dca05`.

Revisión estática del esquema completo, inventario de rutas y módulos, y lectura dirigida de permisos, sesión, vehículos, cotizaciones, agenda, almacenamiento y cálculos. No se ejecutó ni auditó exhaustivamente la aplicación original.

| Área / archivos de origen | Decisión | Resultado en GarageOS |
| --- | --- | --- |
| `prisma/schema.prisma`: Shop, User, tablas de auth, Client, Vehicle | Adaptar | Conservados; esquema SQL `garageos`; FR predeterminado; un usuario sigue perteneciendo como máximo a un taller |
| Mismo esquema: Quote, Invoice, vehículos y líneas, pagos | Adaptar | Conservados; factura inicia DRAFT; conversión cotización-factura ahora tiene relación; removidos RevenueType y recordedRevenue |
| Mismo esquema: agenda, horarios, catálogo y recordatorios | Reutilizar estructura | Conservados; falta trasladar sus servicios de aplicación |
| Mismo esquema: documentos y caja | Conservar modelo auxiliar | Sin integración de almacenamiento ni lógica contable conectada |
| `src/lib/client-name.ts` | Copiar | `src/domain/client-name.ts`, con pruebas |
| `src/actions/vehicles.ts`, `src/lib/permissions.ts`, `src/lib/shop-context.ts` | Reescribir capa de acceso | Referencia para filtros por taller; no se copiaron actions ni auth |
| `src/lib/booking-slots.ts`, `src/lib/shop-timezone.ts` | Adaptar después | Agenda depende de DB, catálogo y diccionario; revisar cambios de horario y concurrencia antes de portar |
| `src/lib/taxes.ts`, `invoice-number.ts`, `invoice-payments.ts` | Rediseñar | Tasas separadas y snapshots; numeración transaccional; pago independiente de impuestos |
| `src/lib/storage.ts` | Reescribir | El origen crea bucket contable público; el producto necesita almacenamiento privado y acceso temporal autorizado |
| PDFs, emails, SMS y traducciones | Adaptar después | Reutilizar diseño y contenido tras desacoplar marca, URLs y remitentes |
| `src/config/brand.ts`, seed, setup, bootstrap, scripts particulares | Excluir | Configuración y operaciones específicas del cliente original |

## Cambios de modelo

Se agrega `WorkOrder` con líneas y ciclo de ejecución, y `QuoteApproval` con decisión, snapshot y hash del documento. Son diseño inicial de GarageOS, no funcionalidades encontradas en el origen.

Se mantiene decimal para cantidades y dinero y numeración única por taller. Se elimina la clasificación de ingresos OFFICIAL/INTERNAL_ONLY como regla de producto y el campo de ingreso alternativo: el método de pago no debe decidir la visibilidad ni el cálculo de una factura. El historial original no se ha migrado ni alterado.

No se copiaron secretos, datos de clientes, archivos públicos del taller, historial Git, instalaciones ni configuraciones de despliegue. No se asigna una nueva licencia en esta extracción; la política de distribución del producto queda pendiente del propietario.

## Segunda entrega: vaciado de la aplicación completa

Sobre la base anterior se copió el árbol completo de `src/` de Mecanico (`app`, `components`, `actions`, `lib`, `emails`, `types`) para tener una aplicación Next.js operativa, en vez de solo el modelo. Se excluyó lo mismo que ya marcaba la tabla anterior más lo específico de esta pasada:

| Excluido | Motivo |
| --- | --- |
| `src/config/brand.ts`, logos/imágenes de marca en `public/`, favicon/OG del taller original | Identidad de un solo cliente (Garage Carlos A Inc.); reemplazado por `src/config/app.ts` genérico y datos por taller (`Shop.name`, `Shop.logoUrl`) |
| `src/app/api/setup/**`, `src/lib/sync-shop-brand.ts`, `src/lib/update-owner-credentials.ts` | Bootstrap de un solo taller (credenciales y slug hardcodeados); sin equivalente multi-taller todavía |
| `src/lib/incremental-migrate.ts`, `/api/version` | Migrador SQL manual atado al schema `mecanico`; GarageOS usa `prisma migrate` normal (`npm run db:migrate`) |
| Clasificación `RevenueType` (`OFFICIAL`/`INTERNAL_ONLY`), `recordedRevenue`, `suppressTaxes` en facturas, cotizaciones, numeración de folio, dashboard y contabilidad | Permitía declarar una factura como "solo interna": sin impuestos, folio en serie separada y **no exportada a contabilidad**. Es la doble contabilidad que el propio audit ya había descartado como regla de producto (ver "Cambios de modelo" arriba); se completó quitando el resto del código que la implementaba, no solo el campo de schema |

Lo demás se copió y se adaptó lo mínimo para compilar: `src/config/app.ts` reemplaza los usos de `BRAND` (URL de la app, timezone por defecto, `bookingPublicPath/Url`); `Sidebar`, login, emails y el PDF de factura ahora leen nombre/logo/email desde el `Shop` o el prop recibido en vez de una constante; el correo de e-transfer usa `shop.email` con un `TODO(garageos)` señalando que falta un campo dedicado por taller antes de aceptar pagos reales.

**Resultado verificado:** `npm install`, `next build` y `npm run check` (`prisma validate` + `prisma generate` + `tsc --noEmit` + pruebas de dominio) pasan limpio salvo deuda pre-existente de Mecanico ya presente antes de esta extracción (incompatibilidad de tipos entre `zod@4` y `@hookform/resolvers@5` en `AppointmentForm`/`InvoiceForm`, y un prop de más en `ServiceReminderEmail`) — enmascarada por `typescript.ignoreBuildErrors: true` en `next.config.ts`, que ya traía Mecanico y se conservó marcada como temporal. `npm run dev` sirve `/` y `/admin/login` correctamente sin DB conectada.

**No se tocó en esta pasada:** los 9 invariantes de `docs/domain-model.md` (aislamiento multi-taller, folios atómicos, aprobación append-only, etc.) siguen sin implementarse — el código importado es el mismo de Mecanico con los mismos huecos de seguridad que ya señalaba ese documento, solo que ahora compila como app. No conectar a producción ni exponerlo públicamente antes de cerrar esos puntos.
