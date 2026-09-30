#!/usr/bin/env bash
# Backup lógico manual de la BD de aplicación (solo lectura). Uso:
#   DIRECT_URL='postgres://…' ./scripts/backup-db.sh [directorio-salida]
# Genera garageos-YYYY-MM-DD.dump (formato custom) + .sha256. Guardar CIFRADO fuera de la plataforma
# (ver docs/operations-runbook.md). Nunca commitear el dump ni imprimir la URL.
set -euo pipefail
: "${DIRECT_URL:?set DIRECT_URL to the DIRECT (non-pooled) connection string}"
out="${1:-.}"; mkdir -p "$out"
f="$out/garageos-$(date -u +%F).dump"
pg_dump --format=custom --no-owner --no-privileges --schema=garageos "$DIRECT_URL" > "$f"
sha256sum "$f" > "$f.sha256"
echo "backup written: $f ($(du -h "$f" | cut -f1))"
