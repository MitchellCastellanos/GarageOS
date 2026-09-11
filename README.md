# GarageOS

Software de gestión para garages independientes de Quebec y Canadá, construido a partir del código operativo de Mecanico Management.

**Estado: aplicación Next.js que compila y corre (`npm run dev` / `next build`), desplegada en Vercel sobre `main`. Hay un proyecto Postgres en Neon creado y el código ya sabe conectarse. `npm run build` ahora aplica las migraciones pendientes automáticamente en cada deploy (ver [docs/db-migrations.md](docs/db-migrations.md)); antes era un paso manual (`npm run db:deploy`) y se olvidó tras la migración inicial, dejando el schema `garageos` sin crear.** Deuda conocida en [docs/reuse-audit.md](docs/reuse-audit.md). Auth, permisos, storage e impuestos vienen adaptados de Mecanico pero no están probados contra datos reales ni aislamiento multi-taller. No exponer a usuarios reales — ver invariantes pendientes en [docs/domain-model.md](docs/domain-model.md), ninguno implementado todavía.

Flujo objetivo: clientes → vehículos → citas → cotización → aprobación → orden de trabajo → factura → pago → recordatorio.

## Empezar

Node.js 22.12+ y npm. Desde este repositorio:

```sh
npm install
npm run check   # valida schema, tipos y pruebas de dominio — sin DB
npm run dev     # app en http://localhost:3000 — sin DB, las páginas con datos fallarán al usarse
```

`npm run check` valida el esquema Prisma, genera sus tipos, comprueba TypeScript y ejecuta pruebas de dominio; no modifica ninguna base de datos. `.env.example` documenta las variables necesarias — copiarlo a `.env` y completar `DATABASE_URL`/`NEXTAUTH_SECRET` como mínimo para levantar el dashboard contra datos reales. Next.js carga `.env` automáticamente para la app; `prisma.config.ts` también lo carga (vía `dotenv/config`) para que `db:push`/`db:migrate`/`db:studio` funcionen sin exportar variables a mano.

Para crear las tablas en una base nueva (Neon u otro Postgres con salida TCP normal — este `db:push` no puede correr desde cualquier sandbox con red restringida):

```sh
npm run db:push
```

## Contenido

- [Idea y alcance V1](docs/product.md)
- [Auditoría de reutilización y procedencia](docs/reuse-audit.md)
- [Modelo y reglas pendientes](docs/domain-model.md)
- [Próximas entregas](docs/roadmap.md)
- [Brecha entre el homepage y el producto, y plan de construcción unificado](docs/feature-gap.md)
- [Validación y deuda de dependencias](docs/validation.md)
- [Migraciones automáticas de base de datos](docs/db-migrations.md)
- [Esquema inicial](prisma/schema.prisma)

El esquema es una adaptación del origen, no una migración compatible con su base de datos. No ejecutar contra Mecanico. Los datos, secretos, branding, scripts de bootstrap y automatizaciones del taller original no forman parte de esta extracción.
