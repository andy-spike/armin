#!/usr/bin/env bash
# Replaces ALL data in this instance with a backup made by backup.sh.
#
#   ./selfhost/restore.sh selfhost/backups/armin-20261029-030000.zip
#
# Restoring onto a new server: copy the old selfhost/.env there first, then run
# setup.sh, then this script.
# Resolve the backup path before lib.sh changes into selfhost/.
file=""
if [ $# -eq 1 ] && [ -f "$1" ]; then file="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"; fi
source "$(dirname "$0")/lib.sh"

require_docker
require_env CONVEX_ADMIN_KEY

[ $# -eq 1 ] || die "Usage: ./selfhost/restore.sh <backup.zip>"
[ -n "$file" ] || die "No backup at $1."

printf '\n  This replaces every deck, card, review, image, and account in this\n'
printf '  instance with the contents of %s.\n' "$(basename "$file")"
printf '  Anything created after that backup is lost.\n\n'
read -r -p "Type RESTORE to continue: " answer
[ "$answer" = RESTORE ] || die "Cancelled. Nothing changed."

compose up -d backend
wait_for_backend
say "Restoring $(basename "$file")"
compose run --rm -T -v "$file:/restore/backup.zip:ro" tools \
  convex import --replace-all --yes /restore/backup.zip
# An older backup may predate data changes in this version.
run_migrations
say "Restore finished. Sign in again."
