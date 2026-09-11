# GarageOS

Software de gestión para garages independientes de Quebec y Canadá, construido a partir del código operativo de Mecanico Management.

**Estado: aplicación Next.js que compila y corre (`npm run dev` / `next build`), sin base de datos conectada todavía y con deuda conocida documentada en [docs/reuse-audit.md](docs/reuse-audit.md).** Auth, permisos, storage e impuestos vienen adaptados de Mecanico pero no están probados contra datos reales ni aislamiento multi-taller. No desplegar a producción — ver invariantes pendientes en [docs/domain-model.md](docs/domain-model.md).

Flujo objetivo: clientes → vehículos → citas → cotización → aprobación → orden de trabajo → factura → pago → recordatorio.

## Empezar

Node.js 22.12+ y npm. Desde este repositorio:

```sh
npm install
npm run check   # valida schema, tipos y pruebas de dominio — sin DB
npm run dev     # app en http://localhost:3000 — sin DB, las páginas con datos fallarán al usarse
```

`npm run check` valida el esquema Prisma, genera sus tipos, comprueba TypeScript y ejecuta pruebas de dominio; no modifica ninguna base de datos. `.env.example` documenta las variables necesarias — copiarlo a `.env` y completar `DATABASE_URL`/`NEXTAUTH_SECRET` como mínimo para levantar el dashboard contra datos reales. No hay carga automática de `.env` en esta base (usar `.env.local` o exportar variables).

## Contenido

- [Idea y alcance V1](docs/product.md)
- [Auditoría de reutilización y procedencia](docs/reuse-audit.md)
- [Modelo y reglas pendientes](docs/domain-model.md)
- [Próximas entregas](docs/roadmap.md)
- [Validación y deuda de dependencias](docs/validation.md)
- [Esquema inicial](prisma/schema.prisma)

El esquema es una adaptación del origen, no una migración compatible con su base de datos. No ejecutar contra Mecanico. Los datos, secretos, branding, scripts de bootstrap y automatizaciones del taller original no forman parte de esta extracción.
