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
6. ✅ Resuelto — `DocumentSequence` (por taller y tipo de documento) + upsert atómico en `src/lib/invoice-number.ts`. Verificado bajo 25 asignaciones concurrentes reales contra Postgres sin folios duplicados. Reemplaza la búsqueda de máximo anterior; incluye backfill para talleres con facturas/cotizaciones ya emitidas.
7. Facturas emitidas y pagos deben conservar historial; correcciones mediante documentos/eventos explícitos. Definir retención y reemplazar cascadas heredadas en relaciones históricas antes de importar datos.
8. ✅ Parcial — el chequeo de solapamiento de mecánico y la creación de la cita ahora ocurren dentro de una sola transacción `Serializable` (`src/actions/appointments.ts`, `src/app/api/book/[slug]/route.ts`), verificado con 10 intentos concurrentes reales contra Postgres (exactamente uno sobrevive). DST sigue sin probarse. Tokens públicos requieren hash, expiración y límites de solicitudes — los campos de token heredados aún no constituyen ese diseño seguro.
9. Archivos privados bajo prefijo de taller, enlaces temporales y autorización en descarga. Email/SMS requieren outbox, idempotencia y preferencias; los timestamps heredados no garantizan entrega única.

## Alcance pendiente del modelo

✅ Resuelto — membresías para usuarios de varios talleres: `Organization` agrupa varios `Shop` (ubicaciones) y `UserShopAccess` da acceso adicional a un usuario más allá de su taller de casa (`User.shopId`, que sigue siendo implícitamente accesible sin necesidad de fila propia — no requirió backfill). `switchActiveShop` cambia la ubicación activa re-firmando la sesión JWT (`unstable_update`, ver `src/lib/auth.ts`) sin cerrar sesión. Verificado de punta a punta en navegador real: alta de ubicación, aparición automática de `Organization` en el primer taller adicional, selector en el topbar y cambio de sesión reflejado en el siguiente render. **No implementa** aislamiento entre organizaciones distintas más allá de lo que ya cubre el punto 1 (sigue siendo verificación a nivel de aplicación, no RLS) ni permisos diferenciados por ubicación — cualquier `UserShopAccess` da acceso completo según el `Role` global del usuario.

Invitaciones, suscripciones, auditoría general, revisiones comerciales normalizadas, impuestos separados, reembolsos, asignación de técnicos a órdenes y vínculo cita-orden se siguen decidiendo al implementar sus casos de uso. No hay RLS, migraciones SQL de aislamiento por fila, ni pruebas de aislamiento multi-organización ejecutadas en esta entrega.
