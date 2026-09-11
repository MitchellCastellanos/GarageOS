import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Prisma v7 usa el motor WASM con driver adapter explícito.
// Usamos pg.Pool para poder configurar SSL — requerido por Supabase en producción.
function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL ?? "";
  const isLocalHost = /localhost|127\.0\.0\.1/.test(connectionString);

  const pool = new Pool({
    connectionString,
    // Neon, Supabase y la mayoría de Postgres en la nube requieren SSL —
    // se activa salvo que apuntemos a un Postgres local sin TLS.
    // rejectUnauthorized: false acepta certificados auto-firmados.
    ssl: isLocalHost ? undefined : { rejectUnauthorized: false },
  });

  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

// Singleton — evita múltiples conexiones durante hot reload en desarrollo
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
