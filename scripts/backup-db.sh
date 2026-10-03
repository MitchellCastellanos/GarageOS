#!/usr/bin/env bash
# Logical backup of the application DB (read-only). Usage:
#   DIRECT_URL='postgres://…' ./scripts/backup-db.sh [output-dir]
# Writes garageos-<UTC timestamp>.dump (pg_dump custom format, already compressed) + .sha256.
# Optional: BACKUP_AGE_RECIPIENT=<age public key> additionally writes <dump>.age (encrypted) and
# removes the plaintext dump, so only ciphertext remains on disk. Never commit dumps or print the URL.
# Optional: BACKUP_PLAINTEXT_DIR=<dir> (e.g. /dev/shm, RAM-backed) holds the transient plaintext dump instead of
# the output dir, so plaintext never touches persistent disk. With an age recipient the plaintext is removed on
# EVERY exit path (success, validation failure, encryption failure).
# Used unattended by .github/workflows/db-backup.yml (see docs/operations-runbook.md).
set -euo pipefail
: "${DIRECT_URL:?set DIRECT_URL to the DIRECT (non-pooled) connection string}"
out="${1:-.}"; mkdir -p "$out"
name="garageos-$(date -u +%Y-%m-%dT%H%M%SZ).dump"
f="$out/$name"
if [ -n "${BACKUP_AGE_RECIPIENT:-}" ] && [ -n "${BACKUP_PLAINTEXT_DIR:-}" ]; then
  mkdir -p "$BACKUP_PLAINTEXT_DIR"; f="$BACKUP_PLAINTEXT_DIR/$name"
fi
plain="$f"
if [ -n "${BACKUP_AGE_RECIPIENT:-}" ]; then trap 'rm -f "$plain"' EXIT; fi
pg_dump --format=custom --no-owner --no-privileges --schema=garageos --schema=public --file="$f" "$DIRECT_URL"
# Fail loudly on an empty/corrupt dump: the archive must be listable and contain the core tables.
toc="$(pg_restore --list "$f")"
for t in garageos.Shop garageos.Client garageos.Invoice garageos.Subscription public._prisma_migrations; do
  grep -Eq "TABLE ${t%%.*} ${t#*.} " <<<"$toc" || { echo "backup invalid: table $t missing from archive" >&2; rm -f "$f"; exit 1; }
done
if [ -n "${BACKUP_AGE_RECIPIENT:-}" ]; then
  age -r "$BACKUP_AGE_RECIPIENT" -o "$out/$name.age" "$f"
  rm -f "$f"; f="$out/$name.age"
fi
sha256sum "$f" > "$f.sha256"
echo "backup written: $f ($(du -h "$f" | cut -f1))"
echo "$f" > "$out/LATEST"
