# Shared helpers for the selfhost/ scripts. Sourced, never run directly.
set -euo pipefail

SELFHOST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SELFHOST_DIR/.env"
cd "$SELFHOST_DIR"

say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33mwarning:\033[0m %s\n' "$*" >&2; }
die() {
  printf '\033[31merror:\033[0m %s\n' "$*" >&2
  exit 1
}

compose() { docker compose --project-directory "$SELFHOST_DIR" "$@"; }

# The Convex CLI in the tools container, talking to this instance's backend.
convex() { compose run --rm -T tools convex "$@"; }

require_docker() {
  command -v docker >/dev/null || die "Docker is not installed. See docs/self-hosting.md."
  docker info >/dev/null 2>&1 ||
    die "Docker is installed but not reachable. Start it, or add your user to the docker group."
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 ('docker compose') is required."
}

# Read KEY from .env (empty when missing).
env_get() {
  [ -f "$ENV_FILE" ] || return 0
  grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true
}

# Set KEY=VALUE in .env, replacing an existing line.
env_set() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp "$SELFHOST_DIR/.env.XXXXXX")"
  if grep -qE "^$key=" "$ENV_FILE"; then
    awk -v k="$key" -v v="$value" 'BEGIN { FS = OFS = "=" } $1 == k { print k "=" v; next } { print }' \
      "$ENV_FILE" >"$tmp"
  else
    cat "$ENV_FILE" >"$tmp"
    printf '%s=%s\n' "$key" "$value" >>"$tmp"
  fi
  chmod 600 "$tmp"
  mv "$tmp" "$ENV_FILE"
}

require_env() {
  [ -f "$ENV_FILE" ] || die "selfhost/.env is missing. Run ./selfhost/setup.sh first."
  local key
  for key in "$@"; do
    [ -n "$(env_get "$key")" ] || die "$key is not set in selfhost/.env. Run ./selfhost/setup.sh first."
  done
}

random_secret() { head -c 32 /dev/urandom | base64 | tr -d '\n'; }
random_hex() { head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }

wait_for_backend() {
  local i
  for i in $(seq 1 60); do
    if [ "$(docker inspect -f '{{.State.Health.Status}}' "$(compose ps -q backend)" 2>/dev/null)" = healthy ]; then
      return 0
    fi
    sleep 2
  done
  compose logs --tail 50 backend >&2 || true
  die "The Convex backend did not become healthy. Its recent logs are above."
}

# Push the backend functions and the deployment settings this instance needs.
deploy_backend() {
  say "Configuring the Convex backend"
  {
    printf 'SITE_URL=%s\nBETTER_AUTH_SECRET=%s\nSELF_HOSTED=true\n' \
      "$(env_get SITE_URL)" "$(env_get BETTER_AUTH_SECRET)"
    # Concept cards: both set turns generation on through your gateway key.
    local name
    for name in AI_GATEWAY_API_KEY AI_GATEWAY_MODEL; do
      [ -z "$(env_get "$name")" ] || printf '%s=%s\n' "$name" "$(env_get "$name")"
    done
  } | convex env set --force >/dev/null
  say "Deploying Armin's backend functions (this takes a minute)"
  convex deploy --yes
  # Capture first: under pipefail, grep -q exiting early would fail the pipe.
  local vars
  vars="$(convex env list)"
  # A gateway setting cleared in .env is removed, turning concept cards off.
  for name in AI_GATEWAY_API_KEY AI_GATEWAY_MODEL; do
    if [ -z "$(env_get "$name")" ] && grep -q "^$name=" <<<"$vars"; then
      convex env remove "$name" >/dev/null
    fi
  done
  if ! grep -q '^JWKS=' <<<"$vars"; then
    # Store the auth signing keys in the deployment so token checks never
    # fetch this instance's own public URL.
    say "Creating sign-in signing keys"
    convex run selfHost:signingKeys | node_json_string | convex env set JWKS >/dev/null
  fi
}

# Whether the owner account exists (setup.sh, create-owner.sh).
owner_exists() {
  [ "$(convex run selfHost:ownerExists | tr -d '[:space:]')" = true ]
}

# `convex run` prints the action's return value as JSON; unwrap the string.
node_json_string() {
  compose run --rm -T tools node -e '
    let input = "";
    process.stdin.on("data", (chunk) => (input += chunk));
    process.stdin.on("end", () => process.stdout.write(JSON.parse(input)));
  '
}
