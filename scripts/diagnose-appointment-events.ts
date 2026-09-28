// Diagnóstico temporal de solo lectura — ver commit que lo introdujo. Nunca escribe nada.
import { db } from "@/lib/db";

async function main() {
  const schemaRows = await db.$queryRawUnsafe<any[]>(
    `SELECT table_schema FROM information_schema.tables WHERE table_name = '_prisma_migrations'`
  );
  console.log("[_prisma_migrations lives in schema]", JSON.stringify(schemaRows));

  const schema = schemaRows[0]?.table_schema ?? "public";
  const migrationRows = await db.$queryRawUnsafe<any[]>(
    `SELECT migration_name, started_at, finished_at, applied_steps_count, logs
     FROM "${schema}"."_prisma_migrations"
     WHERE migration_name LIKE '%appointment_events%'
     ORDER BY started_at ASC`
  );
  console.log("[_prisma_migrations rows]", JSON.stringify(migrationRows, null, 2));

  const tableRows = await db.$queryRawUnsafe<any[]>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'garageos' AND table_name = 'AppointmentEvent'`
  );
  console.log("[AppointmentEvent table exists?]", JSON.stringify(tableRows));

  const columnRows = await db.$queryRawUnsafe<any[]>(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema = 'garageos' AND table_name = 'AppointmentEvent'
     ORDER BY ordinal_position`
  );
  console.log("[AppointmentEvent columns]", JSON.stringify(columnRows));

  const enumRows = await db.$queryRawUnsafe<any[]>(
    `SELECT typname FROM pg_type WHERE typname IN ('AppointmentEventType', 'AppointmentActorType')`
  );
  console.log("[enums exist?]", JSON.stringify(enumRows));

  const rowCount = await db.$queryRawUnsafe<any[]>(
    `SELECT count(*)::int AS n FROM "garageos"."AppointmentEvent"`
  ).catch((e) => [{ error: String(e) }]);
  console.log("[AppointmentEvent row count]", JSON.stringify(rowCount));
}

main()
  .catch((e) => console.error("[diagnose] failed:", e))
  .finally(() => db.$disconnect());
