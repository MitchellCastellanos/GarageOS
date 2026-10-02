#!/usr/bin/env bash
# Restore a GarageOS logical backup into an ISOLATED, EMPTY scratch database. Never run against Production.
#   RESTORE_TARGET_URL='postgres://…scratch…' [AGE_IDENTITY_FILE=key.txt] ./scripts/restore-drill.sh <dump|dump.age>
# Refuses to run if the target equals DIRECT_URL / DATABASE_URL / DATABASE_URL_POOLED of this shell, or is not empty.
set -euo pipefail
: "${RESTORE_TARGET_URL:?set RESTORE_TARGET_URL to an isolated scratch database}"
src="${1:?path to .dump or .dump.age}"
for v in DIRECT_URL DATABASE_URL DATABASE_URL_POOLED; do
  [ "${!v:-}" = "$RESTORE_TARGET_URL" ] && { echo "refusing: target equals $v" >&2; exit 2; }
done
existing="$(psql "$RESTORE_TARGET_URL" -Atc "select count(*) from pg_tables where schemaname='garageos'")"
[ "$existing" = "0" ] || { echo "refusing: target already has garageos tables" >&2; exit 2; }
dump="$src"
if [[ "$src" == *.age ]]; then
  : "${AGE_IDENTITY_FILE:?set AGE_IDENTITY_FILE to decrypt}"
  dump="$(mktemp)"; trap 'rm -f "$dump"' EXIT
  age -d -i "$AGE_IDENTITY_FILE" -o "$dump" "$src"
fi
pg_restore --no-owner --no-privileges --exit-on-error -d "$RESTORE_TARGET_URL" "$dump"
psql "$RESTORE_TARGET_URL" -Atc "select 'Shop',count(*) from garageos.\"Shop\" union all select 'Client',count(*) from garageos.\"Client\" union all select 'Invoice',count(*) from garageos.\"Invoice\" union all select 'migrations',count(*) from public._prisma_migrations"
echo "restore OK into scratch target. Now run: DIRECT_URL=\$RESTORE_TARGET_URL npx prisma migrate status"
