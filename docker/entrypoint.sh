#!/bin/sh
set -e

CONFIG_PATH="${CONFIG_PATH:-/config/site-config.json}"
CONFIG_DEST="/app/src/content/site-config.json"

# Persist site config on the photos volume
if [ ! -f "$CONFIG_PATH" ] && [ -f "$CONFIG_DEST" ]; then
  cp "$CONFIG_DEST" "$CONFIG_PATH"
  echo "Copied default config to $CONFIG_PATH"
fi

# Sync persisted config to where Astro expects it
if [ -f "$CONFIG_PATH" ]; then
  cp "$CONFIG_PATH" "$CONFIG_DEST"
  echo "Synced config from $CONFIG_PATH"
fi

echo "Generating photo content..."
node /app/scripts/generate-content.mjs

echo "Building static site..."
npx astro build

echo "Starting admin server..."
node /app/admin/server.mjs &

echo "Starting nginx..."
exec nginx -g "daemon off;"
