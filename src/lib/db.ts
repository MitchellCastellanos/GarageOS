import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Prisma v7 usa el motor WASM con driver adapter explícito.
// Usamos pg.Pool para poder configurar SSL — requerido por Supabase en producción.
function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL ?? "";

  const pool = new Pool({
    connectionString,
    // Supabase (y la mayoría de Postgres en la nube) requiere SSL.
    // rejectUnauthorized: false acepta el certificado auto-firmado de Supabase.
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
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
