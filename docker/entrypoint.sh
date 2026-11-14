#!/bin/sh
# Earshot always runs as the unprivileged `node` user (uid 1000).
#
# The container starts as root for one reason: a bind mount such as
# `./data:/data` is created root-owned by Docker on Linux, and the server could
# not write to it. So fix the ownership of the data directory, then drop
# privileges for good. Started with `--user`, this script changes nothing.
set -eu

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  find "$DATA_DIR" \! -user node -exec chown node:node '{}' +
  exec su-exec node "$@"
fi

exec "$@"
