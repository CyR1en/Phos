#!/bin/sh
set -e

PUID=${PUID:-1001}
PGID=${PGID:-1001}

LISTEN_PORT=${LISTEN_PORT:-8080}
export LISTEN_PORT

# Free up requested PUID/PGID if occupied by another user/group (skip appuser itself)
if getent passwd "$PUID" > /dev/null 2>&1; then
  CONFLICT_USER=$(getent passwd "$PUID" | cut -d: -f1)
  if [ "$CONFLICT_USER" != "appuser" ]; then
    deluser "$CONFLICT_USER"
  fi
fi
if getent group "$PGID" > /dev/null 2>&1; then
  CONFLICT_GROUP=$(getent group "$PGID" | cut -d: -f1)
  if [ "$CONFLICT_GROUP" != "appuser" ]; then
    delgroup "$CONFLICT_GROUP"
  fi
fi

usermod -u "$PUID" appuser
groupmod -g "$PGID" appuser

mkdir -p /app/src/generated
chown -R appuser:appuser /app /var/lib/nginx /var/log/nginx /photos /config 2>/dev/null || true
chmod 750 /config

DB_PATH="${DB_PATH:-/config/site.db}"
CONFIG_PATH="${CONFIG_PATH:-/config/site-config.json}"
export DB_PATH CONFIG_PATH
DEFAULT_CONFIG_PATH="/app/src/content/site-config.json"
CONFIG_DEST="/app/src/generated/site-config.json"

# Persist default config if none exists
if [ ! -f "$CONFIG_PATH" ] && [ -f "$DEFAULT_CONFIG_PATH" ]; then
  su-exec appuser cp "$DEFAULT_CONFIG_PATH" "$CONFIG_PATH"
  echo "Copied default config to $CONFIG_PATH"
fi

# Merge default config into persisted config (preserves user edits, adds new fields)
su-exec appuser node /app/scripts/merge-config.mjs "$DEFAULT_CONFIG_PATH" "$CONFIG_PATH"

# Sync merged config to where Astro expects it
su-exec appuser cp -f "$CONFIG_PATH" "$CONFIG_DEST"
echo "Synced config from $CONFIG_PATH"

echo "Migrating config to SQLite..."
su-exec appuser node /app/scripts/migrate-config.mjs

echo "Generating photo content..."
su-exec appuser node /app/scripts/generate-content.mjs

echo "Discovering plugins..."
su-exec appuser node /app/scripts/discover-plugins.mjs

echo "Building static site..."
su-exec appuser npm run build:site

echo "Starting admin server..."
su-exec appuser node /app/admin/server.mjs &

echo "Templating nginx config..."
envsubst '${LISTEN_PORT}' < /app/docker/nginx.conf.template > /etc/nginx/nginx.conf

echo "Starting nginx..."
exec nginx -g "daemon off;"
