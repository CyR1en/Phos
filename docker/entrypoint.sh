#!/bin/sh
set -e

PUID=${PUID:-1001}
PGID=${PGID:-1001}

LISTEN_PORT=${LISTEN_PORT:-8080}
export LISTEN_PORT

usermod -u "$PUID" appuser
groupmod -g "$PGID" appuser

chown -R appuser:appuser /photos /config

CONFIG_PATH="${CONFIG_PATH:-/config/site-config.json}"
CONFIG_DEST="/app/src/content/site-config.json"

# Persist default config if none exists
if [ ! -f "$CONFIG_PATH" ] && [ -f "$CONFIG_DEST" ]; then
  su-exec appuser cp "$CONFIG_DEST" "$CONFIG_PATH"
  echo "Copied default config to $CONFIG_PATH"
fi

# Sync persisted config to where Astro expects it
if [ -f "$CONFIG_PATH" ]; then
  su-exec appuser cp "$CONFIG_PATH" "$CONFIG_DEST"
  echo "Synced config from $CONFIG_PATH"
fi

echo "Generating photo content..."
su-exec appuser node /app/scripts/generate-content.mjs

echo "Building static site..."
su-exec appuser npx astro build

echo "Starting admin server..."
su-exec appuser node /app/admin/server.mjs &

echo "Templating nginx config..."
envsubst '${LISTEN_PORT}' < /app/docker/nginx.conf.template > /etc/nginx/nginx.conf

echo "Starting nginx..."
exec su-exec appuser nginx -g "daemon off;"
