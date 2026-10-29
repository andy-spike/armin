#!/usr/bin/env bash
# Sets a new password for an account on this instance, which doesn't send
# email. Signs that account out everywhere.
#
#   ./selfhost/reset-password.sh
source "$(dirname "$0")/lib.sh"

require_docker
require_env CONVEX_ADMIN_KEY

read -r -p "Account email: " email
read -r -s -p "New password (at least 10 characters): " password
echo
read -r -s -p "Repeat the new password: " repeat
echo
[ "$password" = "$repeat" ] || die "The passwords don't match. Nothing changed."

ARMIN_EMAIL="$email" ARMIN_PASSWORD="$password" compose run --rm -T \
  -e ARMIN_EMAIL -e ARMIN_PASSWORD tools sh -c '
    args="$(node -e "process.stdout.write(JSON.stringify({ email: process.env.ARMIN_EMAIL, password: process.env.ARMIN_PASSWORD }))")"
    convex run selfHost:resetPassword "$args"
  '
