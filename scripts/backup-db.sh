#!/usr/bin/env bash
# Logical backup of the application DB (read-only). Usage:
#   DIRECT_URL='postgres://…' ./scripts/backup-db.sh [output-dir]
# Writes garageos-<UTC timestamp>.dump (pg_dump custom format, already compressed) + .sha256.
# Optional: BACKUP_AGE_RECIPIENT=<age public key> additionally writes <dump>.age (encrypted) and
# removes the plaintext dump, so only ciphertext remains on disk. Never commit dumps or print the URL.
# Used unattended by .github/workflows/db-backup.yml (see docs/operations-runbook.md).
set -euo pipefail
: "${DIRECT_URL:?set DIRECT_URL to the DIRECT (non-pooled) connection string}"
out="${1:-.}"; mkdir -p "$out"
f="$out/garageos-$(date -u +%Y-%m-%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --no-privileges --schema=garageos --file="$f" "$DIRECT_URL"
# Fail loudly on an empty/corrupt dump: the archive must be listable and contain the core tables.
toc="$(pg_restore --list "$f")"
for t in Shop Client Invoice Subscription; do
  grep -Eq "TABLE garageos $t " <<<"$toc" || { echo "backup invalid: table $t missing from archive" >&2; rm -f "$f"; exit 1; }
done
if [ -n "${BACKUP_AGE_RECIPIENT:-}" ]; then
  age -r "$BACKUP_AGE_RECIPIENT" -o "$f.age" "$f"
  rm -f "$f"; f="$f.age"
fi
sha256sum "$f" > "$f.sha256"
echo "backup written: $f ($(du -h "$f" | cut -f1))"
echo "$f" > "$out/LATEST"
