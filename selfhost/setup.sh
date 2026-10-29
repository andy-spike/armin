#!/usr/bin/env bash
# Sets up (or repairs) a self-hosted personal Armin instance on this server.
# Safe to run again: it keeps existing secrets, data, and accounts.
#
#   ./selfhost/setup.sh
#
# Non-interactive: ARMIN_DOMAIN=cards.example.com ACME_EMAIL=you@example.com ./selfhost/setup.sh
source "$(dirname "$0")/lib.sh"

require_docker

if [ ! -f "$ENV_FILE" ]; then
  cp "$SELFHOST_DIR/.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

ask() {
  local key="$1" prompt="$2" value
  value="${!key:-$(env_get "$key")}"
  while [ -z "$value" ]; do
    [ -t 0 ] || die "$key is required. Set it in selfhost/.env or the environment."
    read -r -p "$prompt: " value
  done
  env_set "$key" "$value"
}

cat <<'EOF'

  Armin self-hosting is for one person running a private instance for
  their own use. It comes with no warranty or support guarantee. You are
  responsible for this server, its security, and its backups.

EOF

ask ARMIN_DOMAIN "Domain for Armin (for example cards.example.com)"
ask ACME_EMAIL "Email for Let's Encrypt certificate notices"

domain="$(env_get ARMIN_DOMAIN)"
case "$domain" in
  http://* | https://* | */*) die "ARMIN_DOMAIN must be a bare host name, like cards.example.com." ;;
esac
[ -n "$(env_get ARMIN_API_DOMAIN)" ] || env_set ARMIN_API_DOMAIN "api.$domain"
[ -n "$(env_get ARMIN_ACTIONS_DOMAIN)" ] || env_set ARMIN_ACTIONS_DOMAIN "actions.$domain"

https_port="$(env_get HTTPS_PORT)"
port_suffix=""
[ -z "$https_port" ] || [ "$https_port" = 443 ] || port_suffix=":$https_port"
env_set SITE_URL "https://$domain$port_suffix"
env_set CONVEX_CLOUD_ORIGIN "https://$(env_get ARMIN_API_DOMAIN)$port_suffix"
env_set CONVEX_SITE_ORIGIN "https://$(env_get ARMIN_ACTIONS_DOMAIN)$port_suffix"

[ -n "$(env_get INSTANCE_SECRET)" ] || env_set INSTANCE_SECRET "$(random_hex)"
[ -n "$(env_get BETTER_AUTH_SECRET)" ] || env_set BETTER_AUTH_SECRET "$(random_secret)"

for host in "$domain" "$(env_get ARMIN_API_DOMAIN)" "$(env_get ARMIN_ACTIONS_DOMAIN)"; do
  if ! getent hosts "$host" >/dev/null 2>&1; then
    warn "$host does not resolve yet. Add its DNS record; HTTPS starts working once it does."
  fi
done

mkdir -p "$SELFHOST_DIR/data/convex" "$SELFHOST_DIR/data/caddy" "$SELFHOST_DIR/backups"

say "Building Armin (the first build takes a few minutes)"
compose --profile tools build web tools

say "Starting the Convex backend"
compose up -d backend
wait_for_backend

if [ -z "$(env_get CONVEX_ADMIN_KEY)" ]; then
  say "Creating the Convex admin key"
  key="$(compose exec -T backend ./generate_admin_key.sh | tail -n 1 | tr -d '\r')"
  [ -n "$key" ] || die "Could not create the Convex admin key."
  env_set CONVEX_ADMIN_KEY "$key"
fi

deploy_backend

say "Starting the web app and HTTPS"
compose up -d web caddy

site="$(env_get SITE_URL)"
cat <<EOF

  Armin is running.

  1. Open $site and create your account.
     It becomes the owner account; sign-up then closes.
  2. Copy selfhost/.env somewhere safe. Your backups need it.
  3. Schedule daily backups: see "Backups" in docs/self-hosting.md.

  HTTPS certificates can take a minute after DNS resolves.
  If the page doesn't load: docker compose -f selfhost/docker-compose.yml logs caddy

EOF
