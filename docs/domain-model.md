# Modelo inicial y límites

`prisma/schema.prisma` es ejecutable para validación y generación de cliente. Es una propuesta de persistencia, todavía no un contrato estable para producción.

## Relaciones

Shop contiene usuarios, clientes, documentos comerciales, agenda, horarios, catálogo, caja y recordatorios. Client contiene vehículos. Quote e Invoice contienen grupos por vehículo y líneas con cantidades, precios y garantía. Invoice contiene registros de pago. Quote puede convertirse a una Invoice mediante una relación explícita.

WorkOrder pertenece a Shop, Client y Vehicle; tiene líneas de trabajo y puede vincular cotización y factura. Varias órdenes pueden compartir una cotización o factura multivehículo. QuoteApproval guarda la decisión y el documento exacto presentado. El hash se calculará en servidor sobre una representación canónica; no es por sí solo una firma ni una prueba de identidad.

## Invariantes que debe implementar la siguiente capa

1. Resolver taller desde la sesión autorizada. Verificar pertenencia de cada cliente, vehículo, mecánico, cotización y factura en toda lectura/escritura. El esquema heredado tiene relaciones por ID que **no impiden enlaces entre talleres**; no afirmar aislamiento multi-tenant completo. Añadir claves compuestas o políticas de DB y pruebas de integración antes de servir usuarios.
2. Verificar que los vehículos comerciales y de la orden pertenecen al mismo cliente; no basta con que pertenezcan al mismo taller.
3. Aceptar solo la revisión vigente de una cotización. Cambiar alcance/precio invalida aprobación. La aprobación será append-only, con autenticación o token de uso limitado, vencimiento y registro de actor; el esquema no implementa estos controles por sí mismo.
4. Aplicar el ciclo de `src/domain/work-order.ts` en una transacción con versión o control de concurrencia. La función comprueba solo el cambio de estado, no autorización ni existencia de aprobación. Evitar doble conversión y doble factura ante reintentos.
5. Calcular importes en servidor con decimales; validar cantidad y precio, moneda y total de pagos. Fijar desglose y tasas por documento. El esquema conserva por ahora `taxRate` combinado del origen: falta normalizar impuestos antes de facturar; esta base no certifica cumplimiento fiscal.
6. Usar secuencias atómicas por taller y tipo de documento. Conservar unicidad de números, sin reutilizar folios al cancelar. No portar la búsqueda de máximo como asignador concurrente.
7. Facturas emitidas y pagos deben conservar historial; correcciones mediante documentos/eventos explícitos. Definir retención y reemplazar cascadas heredadas en relaciones históricas antes de importar datos.
8. Reservas deben validar intervalos, horarios y solapamientos dentro de una transacción; probar DST. Tokens públicos requieren hash, expiración y límites de solicitudes. Los campos de token heredados aún no constituyen ese diseño seguro.
9. Archivos privados bajo prefijo de taller, enlaces temporales y autorización en descarga. Email/SMS requieren outbox, idempotencia y preferencias; los timestamps heredados no garantizan entrega única.

## Alcance pendiente del modelo

Membresías para usuarios de varios talleres, invitaciones, suscripciones, auditoría general, revisiones comerciales normalizadas, impuestos separados, reembolsos, asignación de técnicos a órdenes y vínculo cita-orden se decidirán al implementar sus casos de uso. No hay RLS, migraciones SQL ni pruebas de aislamiento ejecutadas en esta entrega.
