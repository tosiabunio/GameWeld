#!/bin/sh
# Starts GameWeld as the unprivileged user `node`.
#
# The container starts as root for one thing only: attachments are kept on a volume, and a volume
# made by an earlier image, or filled by a restore from backup, holds files that belong to root,
# which `node` could not write beside. Whatever in it is not `node`'s is given to `node`, and root
# is then given up for good: the application, and everything it starts, runs as `node`.
#
# Started as another user already (`docker run --user`, or a platform that forbids root), there is
# nothing to give up and nothing it could change: the volume must be writable by that user.
set -e

if [ "$(id -u)" = "0" ]; then
  attachments="${ATTACHMENTS_DIR:-/data/attachments}"
  case "$attachments" in
    /*)
      mkdir -p "$attachments"
      find "$attachments" ! -user node -exec chown node:node {} +
      ;;
  esac
  exec su-exec node "$@"
fi

exec "$@"
