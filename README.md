# GarageOS

Base inicial para productizar Mecanico Management como software de gestión para garages independientes de Quebec y Canadá.

**Estado: modelo de dominio y utilidades comprobables. Todavía no es una aplicación operativa.** No incluye frontend, autenticación ejecutable, conexión a proveedores ni migraciones para producción.

Flujo objetivo: clientes → vehículos → citas → cotización → aprobación → orden de trabajo → factura → pago → recordatorio.

## Empezar

Node.js 22.12+ y npm. Desde este repositorio:

```sh
npm ci
npm run check
```

El comando valida el esquema Prisma, genera sus tipos, comprueba TypeScript y ejecuta pruebas de dominio. No modifica ninguna base de datos. `.env.example` documenta la futura conexión local; Prisma recibe `DATABASE_URL` del entorno. No hay carga automática de `.env` en esta base.

## Contenido

- [Idea y alcance V1](docs/product.md)
- [Auditoría de reutilización y procedencia](docs/reuse-audit.md)
- [Modelo y reglas pendientes](docs/domain-model.md)
- [Próximas entregas](docs/roadmap.md)
- [Validación y deuda de dependencias](docs/validation.md)
- [Esquema inicial](prisma/schema.prisma)

El esquema es una adaptación del origen, no una migración compatible con su base de datos. No ejecutar contra Mecanico. Los datos, secretos, branding, scripts de bootstrap y automatizaciones del taller original no forman parte de esta extracción.
