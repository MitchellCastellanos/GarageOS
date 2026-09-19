// Crea o actualiza la cuenta de super admin a partir de variables de entorno
// — nunca hardcodeado en el repo. Se ejecuta en cada deploy desde
// scripts/deploy-migrations.mjs, después de las migraciones. Idempotente:
// si PLATFORM_ADMIN_EMAIL ya existe, solo se asegura de que su rol sea
// SUPER_ADMIN y (si PLATFORM_ADMIN_PASSWORD cambió) actualiza el hash.
// Sin PLATFORM_ADMIN_EMAIL/PASSWORD configuradas, no hace nada.
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

async function main() {
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  const name = process.env.PLATFORM_ADMIN_NAME?.trim() || "Super Admin";

  if (!email || !password) {
    console.log("[bootstrap-super-admin] PLATFORM_ADMIN_EMAIL/PASSWORD no configuradas — omitiendo.");
    return;
  }
  if (password.length < 8) {
    throw new Error("[bootstrap-super-admin] PLATFORM_ADMIN_PASSWORD debe tener al menos 8 caracteres.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await db.user.findUnique({ where: { email } });

  if (existing) {
    await db.user.update({
      where: { id: existing.id },
      data: { role: "SUPER_ADMIN", passwordHash, name, shopId: null },
    });
    console.log(`[bootstrap-super-admin] ${email} actualizado como SUPER_ADMIN.`);
    return;
  }

  await db.user.create({
    data: { email, name, passwordHash, role: "SUPER_ADMIN" },
  });
  console.log(`[bootstrap-super-admin] ${email} creado como SUPER_ADMIN.`);
}

main()
  .catch((err) => {
    console.error("[bootstrap-super-admin] error fatal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
