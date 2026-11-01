#!/usr/bin/env bash
# Creates this instance's one account (the owner). setup.sh runs it; run it
# yourself if you skipped that step and didn't restore a backup. Website
# sign-up stays closed, so nobody else can claim the instance.
#
#   ./selfhost/create-owner.sh
#
# Non-interactive: ARMIN_OWNER_EMAIL=you@example.com ARMIN_OWNER_PASSWORD=... ./selfhost/create-owner.sh
source "$(dirname "$0")/lib.sh"

require_docker
require_env CONVEX_ADMIN_KEY

compose up -d backend >/dev/null 2>&1
wait_for_backend
if owner_exists; then
  say "This instance already has its owner account. Reset its password with ./selfhost/reset-password.sh."
  exit 0
fi

email="${ARMIN_OWNER_EMAIL:-}"
password="${ARMIN_OWNER_PASSWORD:-}"
name="${ARMIN_OWNER_NAME:-}"
if [ -z "$email" ] || [ -z "$password" ]; then
  [ -t 0 ] || die "Set ARMIN_OWNER_EMAIL and ARMIN_OWNER_PASSWORD, or run this in a terminal."
  say "Create the owner account, the only account on this instance"
  read -r -p "Email: " email
  read -r -p "Name (optional): " name
  read -r -s -p "Password (at least 10 characters): " password
  echo
  read -r -s -p "Repeat the password: " repeat
  echo
  [ "$password" = "$repeat" ] || die "The passwords don't match. Nothing changed."
fi

ARMIN_EMAIL="$email" ARMIN_NAME="$name" ARMIN_PASSWORD="$password" compose run --rm -T \
  -e ARMIN_EMAIL -e ARMIN_NAME -e ARMIN_PASSWORD tools sh -c '
    args="$(node -e "process.stdout.write(JSON.stringify({ email: process.env.ARMIN_EMAIL, name: process.env.ARMIN_NAME, password: process.env.ARMIN_PASSWORD }))")"
    convex run selfHost:createOwner "$args"
  '
