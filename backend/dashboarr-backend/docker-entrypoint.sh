#!/bin/sh
# Ensure /data is writable by the node user (handles the case where the
# operator mounts a host directory that's owned by root), then drop privileges
# and exec the real command.
set -e

if [ ! -d /data ]; then
  mkdir -p /data
fi
chown -R node:node /data 2>/dev/null || true

exec su-exec node "$@"
