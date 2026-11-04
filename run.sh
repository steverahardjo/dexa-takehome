#!/usr/bin/env bash
#
# Build and run the whole stack: PostgreSQL, the NestJS API and the Next.js web
# app. Intended for local development and demos.
#
#   ./run.sh                          # API :3010, web :3000, db :5432
#   API_PORT=4010 WEB_PORT=4000 ./run.sh
#   DB_HOST_PORT=55432 ./run.sh       # when 5432 is already taken
#   WEB_MODE=prod ./run.sh            # production build + `next start`
#
# The API is rebuilt before starting. The database and seed are idempotent, so
# running the script again keeps existing employees and attendance.
#
# The web app runs `next dev` by default: `next build` on Next 16.4.x is flaky
# while prerendering its internal `/_global-error` page ("Cannot read properties
# of null (reading 'useContext')"), which has nothing to do with this app.
# `WEB_MODE=prod` opts into the production build anyway.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

API_PORT="${API_PORT:-3010}"
WEB_PORT="${WEB_PORT:-3000}"
DB_HOST_PORT="${DB_HOST_PORT:-5432}"
DB_DATABASE="${DB_DATABASE:-absences}"
DB_USERNAME="${DB_USERNAME:-absences}"
DB_PASSWORD="${DB_PASSWORD:-absences}"

JWT_SECRET="${JWT_SECRET:-local-development-jwt-secret-change-me}"
OTP_SECRET="${OTP_SECRET:-local-development-otp-secret-change-me}"
OTP_DEV_RETURN="${OTP_DEV_RETURN:-true}"
COMPANY_TIMEZONE="${COMPANY_TIMEZONE:-Asia/Jakarta}"
NEXT_PUBLIC_DEMO_EMAIL="${NEXT_PUBLIC_DEMO_EMAIL:-master@absences.local}"
SEED_DEMO="${SEED_DEMO:-true}"
WEB_MODE="${WEB_MODE:-dev}"

log() {
  printf '\n\033[1;36m==> %s\033[0m\n' "$*"
}

fail() {
  printf '\n\033[1;31m%s\033[0m\n' "$*" >&2
  exit 1
}

command -v npm >/dev/null 2>&1 || fail "npm is required"
command -v docker >/dev/null 2>&1 || fail "docker is required for PostgreSQL"
docker compose version >/dev/null 2>&1 || fail "the Docker Compose plugin is required"

cd "$BACKEND"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created backend/.env from backend/.env.example"
fi
if [ ! -d node_modules ]; then
  log "Installing backend dependencies"
  npm ci
fi

log "Building the API"
npm run build

log "Starting PostgreSQL on 127.0.0.1:${DB_HOST_PORT}"
DB_HOST_PORT="$DB_HOST_PORT" \
DB_DATABASE="$DB_DATABASE" \
DB_USERNAME="$DB_USERNAME" \
DB_PASSWORD="$DB_PASSWORD" \
  docker compose up -d db

for attempt in $(seq 1 60); do
  if docker compose exec -T db pg_isready -U "$DB_USERNAME" -d "$DB_DATABASE" >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    fail "PostgreSQL did not become ready on port ${DB_HOST_PORT}"
  fi
  sleep 1
done

# These environment variables win over backend/.env, so the database the API
# uses always matches the container started above.
export DB_HOST=127.0.0.1
export DB_PORT="$DB_HOST_PORT"
export DB_DATABASE
export DB_USERNAME
export DB_PASSWORD
export NODE_ENV="${NODE_ENV:-development}"
export JWT_SECRET
export OTP_SECRET
export OTP_DEV_RETURN
export COMPANY_TIMEZONE

log "Applying migrations"
node dist/database/migrate.js

log "Seeding master admin and demo data (idempotent)"
SEED_DEMO="$SEED_DEMO" node dist/database/seed.js

cd "$FRONTEND"
if [ ! -d node_modules ]; then
  log "Installing frontend dependencies"
  npm ci
fi

if [ "$WEB_MODE" = "prod" ]; then
  # `next build` can fail inside Next's own prerender of `/_global-error` on
  # 16.4.x. It is nondeterministic, so a clean retry is the workaround.
  for attempt in 1 2; do
    log "Building the web app (attempt ${attempt})"
    rm -rf .next
    if NEXT_PUBLIC_DEMO_EMAIL="$NEXT_PUBLIC_DEMO_EMAIL" \
      NEXT_PUBLIC_COMPANY_TIMEZONE="$COMPANY_TIMEZONE" \
      npm run build; then
      break
    fi
    if [ "$attempt" -eq 2 ]; then
      fail "next build failed twice; rerun with WEB_MODE=dev (or just ./run.sh)"
    fi
    echo "next build failed; retrying once" >&2
  done
fi

log "Starting the API on http://127.0.0.1:${API_PORT}"
cd "$BACKEND"
PORT="$API_PORT" \
PUBLIC_API_URL="http://127.0.0.1:${API_PORT}" \
CORS_ORIGINS="http://localhost:${WEB_PORT},http://127.0.0.1:${WEB_PORT}" \
  node dist/main.js &
API_PID=$!

if [ "$WEB_MODE" = "prod" ]; then
  log "Starting the web app on http://localhost:${WEB_PORT} (production build)"
  cd "$FRONTEND"
  API_URL="http://127.0.0.1:${API_PORT}" \
    npx next start -p "$WEB_PORT" &
else
  log "Starting the web app on http://localhost:${WEB_PORT} (dev server)"
  cd "$FRONTEND"
  API_URL="http://127.0.0.1:${API_PORT}" \
  NEXT_PUBLIC_DEMO_EMAIL="$NEXT_PUBLIC_DEMO_EMAIL" \
  NEXT_PUBLIC_COMPANY_TIMEZONE="$COMPANY_TIMEZONE" \
    npx next dev -p "$WEB_PORT" &
fi
WEB_PID=$!

cleanup() {
  trap - EXIT INT TERM
  kill "$API_PID" "$WEB_PID" 2>/dev/null || true
  wait "$API_PID" "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

printf '\n\033[1;32mStack is running\033[0m\n'
printf '  Web     http://localhost:%s\n' "$WEB_PORT"
printf '  API     http://127.0.0.1:%s/health\n' "$API_PORT"
printf '  Sign in %s (development OTP code is shown on the OTP screen)\n' "$NEXT_PUBLIC_DEMO_EMAIL"
printf '\nPress Ctrl+C to stop the API and web app. The database keeps running:\n'
printf '  docker compose -f backend/docker-compose.yml stop db\n\n'

# Exit as soon as either process stops; the trap cleans up the other one.
wait -n "$API_PID" "$WEB_PID"
