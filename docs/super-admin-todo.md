# Super admin de GarageOS

Panel de GarageOS administrando talleres (no un taller administrando sus
propios clientes) — vive bajo `/platform`, separado del `/admin` de cada
taller. Ver `docs/platform-super-admin.md` para la arquitectura completa de
lo ya implementado (operaciones, analytics, mensajería, crecimiento). Este
doc queda como historial de la decisión original sobre `billingEmail`.

## Contacto de facturación (`billingEmail`)

Existía un campo `Shop.billingEmail`, editable desde Configuración →
Notificaciones, usado únicamente para decidir a qué correo mandaba Stripe
los cobros de la suscripción del taller con GarageOS
(`src/actions/billing.ts`, `customerEmail` del checkout).

Se eliminó (`Shop.billingEmail` dropeado, `src/actions/billing.ts` ahora
cae a `shop.email`) porque conceptualmente no le pertenece a la config de
mensajería del taller — es una relación entre GarageOS y el taller como
*cliente de GarageOS*, no entre el taller y sus propios clientes. Ese tipo
de dato (contacto de cobro, historial de pagos, cambios de plan forzados,
etc.) debería vivir en un panel de super admin donde GarageOS controla la
relación comercial con cada taller, no en la configuración que el dueño
del taller edita sobre sí mismo.

Resuelto: `billingEmail` vive en `Subscription` (no en `Shop`), editable solo
desde `/platform/shops/[id]` → Plan y facturación (`updateBillingContact` en
`src/actions/platform.ts`) — nunca por el propio taller. Cae a `shop.email`
si se deja vacío. El resto de la relación comercial (cambios de plan
manuales con motivo obligatorio, cancelación con historial, notas internas
del equipo, bitácora de acciones) también vive ahí — ver
`docs/platform-super-admin.md`.
