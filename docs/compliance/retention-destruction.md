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

## TODO before GO
Supabase backup facts (checked 2026-09-30): the connector reports the organization on the Free plan and does not expose backup/PITR retention, so **backup retention and restore behavior are not verified** — confirm in the Supabase dashboard and record here. Confirm concrete retention periods with the applicable Quebec/Canadian tax, corporate and privacy requirements and document backup rotation/restore behavior.
