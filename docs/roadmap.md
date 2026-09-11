# Próximas entregas

1. **Persistencia aislada y acceso.** Base local nueva, migración inicial, membresías/roles según V1, claves de pertenencia y pruebas con dos talleres. Criterio: ningún ID del taller B se puede leer o vincular desde A, incluidos archivos y endpoints públicos.
2. **Primer flujo operable.** Interfaz FR/EN, clientes, vehículos y catálogo. Criterio: cada taller configura identidad, idioma y servicios; datos sintéticos, sin copiar información del taller original. **Código de UI importado, compilando y desplegado en Vercel sobre `main`** (ver docs/reuse-audit.md, "Segunda" y "Tercera entrega"). Se creó el proyecto Postgres en Neon y se conectó el código (`DATABASE_URL`, fix de SSL, fix de carga de `.env` en `prisma.config.ts`), pero **`db:push`/`migrate` nunca se ejecutó con éxito** — el schema `garageos` puede no existir todavía en Neon. Falta: correrlo desde un entorno con salida TCP normal, cargar datos sintéticos, y confirmar el flujo con el criterio de aislamiento del punto 1, que sigue sin implementarse.
3. **Cotización → aprobación → orden.** Revisiones, tokens limitados, transacciones y asignación de técnicos. Criterio: cambiar precio obliga nueva aprobación; repetir una conversión no duplica trabajo.
4. **Factura y pagos.** Desglose fiscal configurable, folios atómicos, snapshots y correcciones, PDF. Criterio: concurrencia no duplica folios y los pagos cuadran con el saldo. Validar reglas fiscales aplicables antes del piloto.
5. **Agenda y comunicaciones.** Adaptar reservas, horarios, recordatorios y plantillas; almacenamiento privado y outbox. Criterio: no hay doble reserva ni mensaje duplicado al reintentar; cambios de horario probados.
6. **Piloto y comercialización.** Onboarding de dos talleres, backups/restauración, métricas de soporte y revisión de precios. Suscripciones y despliegue llegan después de cerrar estas condiciones.

Esta entrega completa únicamente la base de modelo y la extracción documentada. `npm run check` valida esa base; no demuestra que el producto completo esté listo.

## Estado al cierre de esta sesión

- `main`: app Next.js completa, compila y pasa `npm run check`; desplegada en Vercel (build verde).
- Neon: proyecto creado, credenciales en `.env` local (no en git) y pendientes de poner en Vercel; `db:push` sin confirmar — próximo paso inmediato antes de tocar cualquier flujo con datos reales.
- Nada del punto 1 (aislamiento multi-taller) ni de los 9 invariantes de `docs/domain-model.md` se implementó en esta sesión: siguen siendo el bloqueador real para un piloto, no solo el pendiente de conectar la DB.
- Plan sin cerrar: puntos 3 a 6 completos (cotización→orden, factura/pagos, agenda/comunicaciones, piloto) siguen sin empezar.
