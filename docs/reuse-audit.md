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
