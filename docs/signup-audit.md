# Signup flow and database initialization

Production logs on 2026-09-11 confirm P2021: garageos.User does not exist. Signup fails at its first user lookup, before account creation or session issuance. Login fails for the same reason.

Email signup validates shop/name/email/password (8+ characters), normalizes email, checks duplicates, hashes the password, creates Shop and OWNER in one transaction, issues an Auth.js session and redirects to /admin/dashboard. A session error after creation redirects to login with an account-created message. There is no email verification or onboarding wizard.

The initial migration creates the complete garageos schema because the dashboard queries clients, invoices and reminders immediately. It does not modify the public schema.

Migrations now apply automatically: `npm run build` runs `scripts/deploy-migrations.mjs` (via `prisma migrate deploy`) before `next build`, so every Vercel deploy applies pending migrations against the production database with no manual step. See [docs/db-migrations.md](db-migrations.md) for how this works and how to run it manually if ever needed.

Prisma CLI uses DIRECT_URL when populated, otherwise DATABASE_URL. Application runtime continues to use DATABASE_URL. This migration is for an uninitialized garageos schema; inspect an existing/partial schema before applying or baselining it. Do not use migrate reset or accept-data-loss.

Validation: generated SQL applied successfully to isolated PGlite PostgreSQL; 25 tables created; owner/shop relation and unique email checked. Existing 3 domain tests passed. Auth.js implementation confirms signIn with redirect:false still sets session cookies. Production signup/session/dashboard have NOT been verified successfully; no production database was modified. Google environment configuration remains with the owner.
