#!/bin/bash

PUID=${PUID:-0}
PGID=${PGID:-0}
UMASK=${UMASK:-002}

umask "$UMASK"

if [ "$PUID" != "0" ]; then
  groupmod -o -g "$PGID" prism 2>/dev/null || groupadd -o -g "$PGID" prism
  usermod -o -u "$PUID" -g "$PGID" prism 2>/dev/null || useradd -o -u "$PUID" -g "$PGID" -d /app -s /bin/bash prism

  chown prism:prism /app
  chown -R prism:prism /config /output 2>/dev/null || true

  exec gosu prism node webui/server/index.js
else
  exec node webui/server/index.js
fi
