# Super admin de GarageOS — pendiente de planear

Este doc es un placeholder para cuando se planee el panel de super admin
(GarageOS administrando talleres, no un taller administrando sus propios
clientes). No hay nada implementado todavía — es solo la lista de cosas
que quedaron fuera de alcance de otros cambios porque, en realidad,
pertenecen aquí.

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

Falta decidir cuando se diseñe ese panel:
- ¿El contacto de facturación lo edita el propio taller (como antes) o
  solo GarageOS desde el super admin?
- ¿Vive en `Shop` o en una tabla aparte ligada a `Subscription`?
- ¿Qué más de la relación comercial (no solo el email) debería moverse
  ahí — método de pago, historial de facturas, cambios de plan manuales,
  notas internas del equipo de GarageOS sobre el taller?

Hasta entonces, Stripe simplemente usa `shop.email` (o el email de login
del dueño como último fallback) — sin regresión funcional, solo sin la
posibilidad de diferenciar "contacto general" de "contacto de cobros".
