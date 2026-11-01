#!/usr/bin/env bash
# Exports the whole instance (all data and images) to selfhost/backups/ and
# keeps the newest BACKUP_KEEP files (default 7).
#
#   ./selfhost/backup.sh
#
# Daily at 03:00, from `crontab -e`:
#   0 3 * * * /path/to/armin/selfhost/backup.sh >> /path/to/armin/selfhost/backups/backup.log 2>&1
source "$(dirname "$0")/lib.sh"

require_docker
require_env CONVEX_ADMIN_KEY

name="armin-$(date -u +%Y%m%d-%H%M%S).zip"
say "Exporting to selfhost/backups/$name"
convex export --include-file-storage --path "/backups/$name"

keep="$(env_get BACKUP_KEEP)"
keep="${keep:-7}"
case "$keep" in '' | *[!0-9]* | 0) die "BACKUP_KEEP must be a whole number of 1 or more." ;; esac
# Prune and hand the files to the backup folder's owner from inside the
# container, which created them.
compose run --rm -T tools sh -c '
  cd /backups
  ls -1t armin-*.zip | tail -n +$(('"$keep"' + 1)) | xargs -r rm -f --
  chown "$(stat -c %u:%g /backups)" armin-*.zip
'
say "Backup saved. Copy it, and selfhost/.env, off this server too."
