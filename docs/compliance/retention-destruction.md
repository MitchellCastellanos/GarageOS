# Personal-information retention and destruction

Status: operational baseline; exact statutory retention periods must be validated for each record class before launch.

## Rule
Keep personal information only while it is needed for the documented purpose or a legal retention requirement. When no longer required, securely destroy it or anonymize it where legally permitted.

## Record classes
- Account/profile/security data: while account is active plus the period reasonably needed for security, disputes and legal obligations.
- Shop customer/vehicle/workflow data: while required to provide the shop service; after termination, follow the documented export/deletion process subject to legal holds and statutory requirements.
- Billing, invoices, payments and tax records: retain for the applicable statutory accounting/tax period; do not guess the period in product copy.
- Communications and delivery logs: only as long as operational, compliance, dispute and security purposes require.
- Audit/security logs: proportionate period based on security need.
- Support records: only as long as support, quality, dispute and legal purposes require.
- Files/object storage: private documents live in the private `accounting` / `communications` Supabase buckets and are only reachable through authorized, expiring access; they are not automatically deleted today — deletion of a record does not delete its object (a per-class deletion job is a P2 follow-up). Supabase Storage objects are not covered by database backups.
- Backups: expire through the documented backup lifecycle; deleted production data may persist until backup rotation completes.

## Destruction
Production data: application/database deletion or irreversible anonymization where appropriate. Files/object storage: delete associated objects. Exports/local files: securely delete. Backups: expire by rotation unless a legal hold applies.

## Legal holds
Suspend scheduled destruction for records subject to a litigation, regulatory, tax or other documented legal hold. Record the reason, scope, owner and release date.

## Backup and recovery facts (reviewed 2026-09-30)
**Verified from our infrastructure (INFRA)**
- The connected Supabase project "Garage OS" (`saccjhinmeaoqoeuhljd`, us-east-1) belongs to an organization on the **Free plan**. It holds **Storage only** (the application tables are not in it).
- The Supabase connector cannot read backup/PITR settings; nothing about backups is verified from the account itself.
- The application PostgreSQL database is on **Neon** (`neondb`, hostname `…us-east-2.aws.neon.tech`), identified from the datasource line Prisma prints in Vercel build logs — not from the Supabase project. Its plan, backup/restore window and retention are **unknown** (no Neon connector); check the Neon console. The Supabase backup facts below apply to the Supabase Storage project only.

**From official Supabase documentation (DOC; https://supabase.com/docs/guides/platform/backups, read via the Supabase docs API)**
- Automatic daily backups exist for **Pro, Team and Enterprise** projects; Pro keeps the last **7** days, Team 14, Enterprise up to 30. Free-plan projects are told to export regularly with `supabase db dump` and keep off-site backups — i.e. **Free has no managed backups**.
- Point-in-Time Recovery is a paid add-on (Pro or higher, at least Small compute; ~US$100/month for 7-day recovery, US$200 for 14, US$400 for 28 per the pricing table on that page). Enabling PITR replaces daily backups; worst-case RPO is about 2 minutes.
- **Database backups do not include Storage objects** — only their metadata. Restoring a backup does not restore objects deleted afterwards. Deleting a project permanently deletes its backups.
- Restoring makes the project unavailable for the duration (proportional to DB size).

**Implications**
- Files (invoices, receipts, DVI photos, Inbox attachments) currently have **no backup at all**. An accidental deletion of an object is unrecoverable unless we keep our own copy (see `operations-runbook.md` → Database and Storage backup).
- Retention period for backups is a decision, not a fact: choose (and record here) the restore window we can live with (recommended starting point: 7-day daily backups + a weekly off-platform encrypted dump kept 4–8 weeks). Deleted data persists in backups until they rotate out; the privacy request procedure must say so.

**Remaining decisions (owner: Privacy Officer / founder)** — no purchase has been made or changed
1. Record the Neon plan and its restore window (Neon console); upgrade the tier if the window is too short for launch. Separately decide whether the Supabase project (Storage only) moves to Pro (US$25/month per Supabase billing docs) — it still gives no backup of Storage objects, so the independent storage copy (`scripts/backup-storage.ts`) is what protects files.
2. Statutory accounting/tax retention periods (Québec/Canada) — still to be confirmed with an accountant/lawyer; do not guess in product copy.
3. Backup retention window for personal data after a deletion request.

## TODO before GO
Confirm concrete retention periods with the applicable Quebec/Canadian tax, corporate and privacy requirements and document backup rotation/restore behavior.
