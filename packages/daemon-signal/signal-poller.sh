#!/bin/bash
# Continuous Signal bridge poller for the Endo daemon.
# Calls pollOnce in a tight loop; signal-cli receive blocks up to TIMEOUT
# seconds between message drains, so this is an efficient long-poll.

ENDO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENDO_BIN="$ENDO_ROOT/packages/cli/bin/endo"
POLL_JS="$ENDO_ROOT/packages/daemon-signal/poll-signal.js"

log() { echo "[signal-poller] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >&2; }

log "Starting Signal bridge poller (pid=$$)"

while true; do
  if result=$("$ENDO_BIN" run --UNCONFINED "$POLL_JS" --powers HOST 2>&1); then
    if [ "$result" != "[]" ] && [ -n "$result" ]; then
      log "Handled: $result"
    fi
  else
    log "Poll error (daemon may be restarting): $result"
    sleep 5
  fi
done
