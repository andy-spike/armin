#!/usr/bin/env bash
# Updates a self-hosted instance to the code in this checkout. Run after
# `git pull`. Takes a backup first, then rebuilds and redeploys.
#
#   git pull && ./selfhost/update.sh
source "$(dirname "$0")/lib.sh"

require_docker
require_env SITE_URL CONVEX_ADMIN_KEY BETTER_AUTH_SECRET

say "Rebuilding Armin"
compose --profile tools build web tools

compose up -d backend
wait_for_backend

say "Backing up before the update"
"$SELFHOST_DIR/backup.sh"

deploy_backend

say "Restarting the web app"
compose up -d web caddy
say "Update finished: $(env_get SITE_URL)"
