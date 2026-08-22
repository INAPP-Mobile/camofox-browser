#!/bin/sh
set -e

echo "[entrypoint] Starting as: $(id)"

# Debug: check volume mount
ls -la /data/ 2>/dev/null || echo "[entrypoint] /data not found"
ls -la /data/profiles 2>/dev/null || echo "[entrypoint] /data/profiles not found"

# Fix volume permissions — Railway mounts volumes as root
mkdir -p /data/profiles
chmod 777 /data/profiles 2>/dev/null || true
chown -R app:app /data/profiles 2>/dev/null || true

echo "[entrypoint] After fix:"
ls -la /data/profiles

# Drop to app user and run the main command
exec gosu app "$@"
