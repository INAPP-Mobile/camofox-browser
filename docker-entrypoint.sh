#!/bin/sh
set -e

# Fix volume permissions — Railway mounts volumes as root,
# but we run as the `app` user.
if [ -d /data/profiles ]; then
  chown -R app:app /data/profiles 2>/dev/null || true
fi

# Drop to app user and run the main command
exec gosu app "$@"
