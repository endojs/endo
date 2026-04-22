#!/usr/bin/env bash
# @endo/genie bottle shell recipe — Phase 0
#
# Stands up an Endo daemon, installs a network transport, runs genie setup.js
# (Phase 0 fallback shape: the existing main-genie path driven by GENIE_MODEL /
# GENIE_WORKSPACE env), and then issues `endo invite owner` at the host level
# so the operator can attach their own daemon via the matching `endo accept`
# flow.
#
# This is the Phase 0 composition proof: everything is stitched from primitives
# that already exist, so the later phases (R2 --owner flag, R3 primordial
# genie, systemd unit, sd_notify, etc.) can replace these pieces one at a time.
# See PLAN/genie_in_bottle.md for the surrounding design and
# TODO/81_genie_bottle_phase0_shell.md for the scope that this script
# implements.
#
# Usage:
#   ./packages/genie/scripts/bottle.sh [options]
#
# Options:
#   --transport=(libp2p|tcp|both)
#                       transport(s) to bring up. Default: libp2p.
#   --workspace=<path>  genie workspace directory.
#                       Default: $XDG_DATA_HOME/endo/genie/workspace.
#   --listen=<host:port> TCP listen address.
#                        Default: 127.0.0.1:0 (OS-assigned ephemeral port).
#   -E KEY=VAL          Set an environment variable.  Repeatable.
#   -f <env-file>       Source a file of `export KEY=VAL` lines.
#   --help              Show this help and exit 0.
#
# Required environment:
#   GENIE_MODEL         LLM model spec, e.g. ollama/llama3.2.
#                       Phase 2 will let the owner hand model credentials in
#                       over the invite edge instead; for Phase 0 we still
#                       require it up front.
#
# Exit status:
#   0  owner attached
#   1  bad usage / prerequisites / transport turnup failed

set -euo pipefail

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$PACKAGE_DIR/../.." && pwd)"
DAEMON_PKG="$REPO_ROOT/packages/daemon"

# ---------------------------------------------------------------------------
# Usage / help
# ---------------------------------------------------------------------------

usage() {
  sed -n '3,40p' "$0" | sed 's/^# \{0,1\}//'
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

TRANSPORT="libp2p"
WORKSPACE_ARG=""
LISTEN_ADDR_ARG="127.0.0.1:0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;

    --transport=*)
      TRANSPORT="${1#--transport=}"
      shift
      ;;

    --transport)
      shift
      TRANSPORT="${1:-}"
      [[ -n "$TRANSPORT" ]] || { echo "[bottle] ERROR: --transport needs a value." >&2; exit 1; }
      shift
      ;;

    --workspace=*)
      WORKSPACE_ARG="${1#--workspace=}"
      shift
      ;;

    --workspace)
      shift
      WORKSPACE_ARG="${1:-}"
      shift
      ;;

    --listen=*)
      LISTEN_ADDR_ARG="${1#--listen=}"
      shift
      ;;

    --listen)
      shift
      LISTEN_ADDR_ARG="${1:-}"
      shift
      ;;

    -f)
      shift
      if [[ -z "${1:-}" || ! -f "$1" ]]; then
        echo "[bottle] ERROR: -f requires a readable env-file path." >&2
        exit 1
      fi
      echo "[bottle] Loading env from $1"
      # shellcheck disable=SC1090
      set -a
      source "$1"
      set +a
      shift
      ;;

    -E)
      shift
      if [[ -z "${1:-}" || "$1" != *=* ]]; then
        echo "[bottle] ERROR: -E requires KEY=VAL argument." >&2
        exit 1
      fi
      export "$1"
      echo "[bottle] Set ${1%%=*}"
      shift
      ;;

    *)
      echo "[bottle] ERROR: Unknown option: $1" >&2
      echo "Run '$0 --help' for usage." >&2
      exit 1
      ;;
  esac
done

# Normalize transport aliases.
# the operator is expected to supply a suitable --listen.
TRANSPORT_BANNER="$TRANSPORT"
case "$TRANSPORT" in
  libp2p|tcp|both)
    TRANSPORT_BANNER="$TRANSPORT (tcp over overlay)"
    TRANSPORT="tcp"
    ;;
  *)
    echo "[bottle] ERROR: --transport must be one of libp2p|tcp|both (got '$TRANSPORT')." >&2
    exit 1
    ;;
esac

# ---------------------------------------------------------------------------
# Validate required configuration
# ---------------------------------------------------------------------------

if [[ -z "${GENIE_MODEL:-}" ]]; then
  echo "[bottle] ERROR: GENIE_MODEL is not set." >&2
  echo "  Set it via environment, -f <env-file>, or -E GENIE_MODEL=<spec>." >&2
  echo "  (Phase 2 will let the owner hand model credentials in over the" >&2
  echo "   invite edge instead; for Phase 0 we still require it up front.)" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Workspace and state directories
# ---------------------------------------------------------------------------

if [[ -n "$WORKSPACE_ARG" ]]; then
  WORKSPACE="$WORKSPACE_ARG"
elif [[ -n "${GENIE_WORKSPACE:-}" ]]; then
  WORKSPACE="$GENIE_WORKSPACE"
else
  WORKSPACE="${XDG_DATA_HOME:-$HOME/.local/share}/endo/genie/workspace"
  echo "[bottle] GENIE_WORKSPACE unset — using default $WORKSPACE" >&2
fi

mkdir -p "$WORKSPACE"

export ENDO_ADDR="$LISTEN_ADDR_ARG"
export GENIE_WORKSPACE="$WORKSPACE"
export GENIE_MODEL

PENDING_INVITE_FILE="$WORKSPACE/PENDING_OWNER_INVITE"

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------

cat <<EOF

=== genie in a bottle (Phase 0) ===
 transport : $TRANSPORT_BANNER
 workspace : $WORKSPACE
 listen    : $ENDO_ADDR
 model     : $GENIE_MODEL
====================================

EOF

# ---------------------------------------------------------------------------
# Start daemon and wait for ping
# ---------------------------------------------------------------------------

echo "=== Phase 1: Start daemon ==="
endo start

echo "[bottle] Waiting for daemon to become ready..."
daemon_ready=0
for _ in $(seq 1 30); do
  if endo ping >/dev/null 2>&1; then
    daemon_ready=1
    break
  fi
  sleep 1
done

if [[ "$daemon_ready" -ne 1 ]]; then
  echo "[bottle] ERROR: Daemon failed to become ready after 30s." >&2
  endo log 2>/dev/null | tail -20 >&2 || true
  exit 1
fi
echo "[bottle] Daemon started and ready."

# ---------------------------------------------------------------------------
# Transport turnup
# ---------------------------------------------------------------------------

install_libp2p() {
  echo "[bottle] Installing libp2p transport at @nets/libp2p..."
  endo run --UNCONFINED \
    "$DAEMON_PKG/src/networks/setup-libp2p.js" \
    --powers @agent
}

install_tcp() {
  echo "[bottle] Installing TCP transport at @nets/tcp (listen=$ENDO_ADDR)..."
  endo store --text "$ENDO_ADDR" --name tcp-listen-addr
  endo make --UNCONFINED \
    "$DAEMON_PKG/src/networks/tcp-netstring.js" \
    --powers @agent --name network-service
  endo mv network-service @nets/tcp
}

echo ""
echo "=== Phase 2: Transport turnup ==="

case "$TRANSPORT" in
  libp2p)
    install_libp2p
    ;;
  tcp)
    install_tcp
    ;;
  both)
    install_libp2p
    install_tcp
    ;;
esac

# ---------------------------------------------------------------------------
# Genie setup (Phase 0 shape: main-genie fallback)
# ---------------------------------------------------------------------------

echo ""
echo "=== Phase 3: Genie setup ==="

# TODO(phase-1): add an `--owner` flag here to provision the R2
#   root-genie guest with both @agent and @host introduced, in place of
#   the main-genie fallback used below.  See PLAN/genie_in_bottle.md
#   § "Phase 1: --owner flag in setup.js (R2)" and
#   § "Root genie (the R2+R3 shape)".
endo run --UNCONFINED \
  "$PACKAGE_DIR/setup.js" --powers @agent \
  -E "GENIE_MODEL=$GENIE_MODEL" \
  -E "GENIE_WORKSPACE=$GENIE_WORKSPACE"

echo "[bottle] Setup completed."

# ---------------------------------------------------------------------------
# Owner invite
# ---------------------------------------------------------------------------

echo ""
echo "=== Phase 4: Owner invite ==="

# `endo invite owner` runs at the _host_ level (no -a @agent), so the
# acceptor gets a peer-host handle rather than a child guest.  This is
# the R3 shape from PLAN/genie_in_bottle.md § "Root genie (the R2+R3
# shape)".
INVITE_LOCATOR="$(endo invite owner)"
if [[ -z "$INVITE_LOCATOR" ]]; then
  echo "[bottle] ERROR: endo invite owner produced no locator." >&2
  exit 1
fi

# Persist for polling tools / systemd consumers.
printf '%s\n' "$INVITE_LOCATOR" > "$PENDING_INVITE_FILE"

cat <<EOF

================= OWNER INVITE =================
 Pipe the locator below into \`endo accept\` on
 your local daemon to attach as this bottle's
 owner, e.g.:

   echo '<locator>' | endo accept bottle

 The locator is also written to:
   $PENDING_INVITE_FILE
 and is removed once the owner attaches.

 LOCATOR:
$INVITE_LOCATOR
=================================================

EOF

# ---------------------------------------------------------------------------
# Readiness wait — poll the host inbox for the first message from a
# non-self locator.  Phase 5 ("sd_notify") replaces this with a real
# readiness signal.
# ---------------------------------------------------------------------------

echo ""
echo "=== Phase 5: Waiting for owner to attach ==="
echo "[bottle] Tailing inbox for first non-self message..."

# The host's own `@self` locator; any inbox message whose `from` does
# not match this is something an external peer (the owner) sent in.
SELF_LOCATOR="$(endo locate @self 2>/dev/null || true)"
if [[ -z "$SELF_LOCATOR" ]]; then
  echo "[bottle] WARN: could not resolve @self; falling back to" >&2
  echo "         naive first-message detection." >&2
fi

owner_attached=0
# The inbox listing starts empty after a fresh daemon.  We intentionally
# do not bound this wait — the operator may take minutes to accept.  An
# interrupt (Ctrl-C) is the escape hatch.
while :; do
  inbox_output="$(endo inbox 2>/dev/null || true)"
  if [[ -n "$inbox_output" ]]; then
    # Crude filter: a line whose verb is `sent` / `sent form` /
    # `sent value` / `replied to` and whose from-side is a *quoted*
    # name (i.e. rendered via reverseLocate — which for an outside
    # peer means they are in our pet store, i.e. the owner after
    # accept).  `inbox.js` renders self-originated messages as
    # `you ... yourself`, so quoted-name on the left is an external
    # sender.
    if echo "$inbox_output" \
         | grep -E '^[0-9]+\. "[^"]+" (sent|replied to|sent form|sent value) ' \
         >/dev/null; then
      owner_attached=1
      break
    fi
  fi
  sleep 2
done

if [[ "$owner_attached" -eq 1 ]]; then
  rm -f "$PENDING_INVITE_FILE"
  echo "[bottle] Owner attached — first message received."
  echo "[bottle] Removed $PENDING_INVITE_FILE."
fi

# Keep the daemon alive so the owner can keep talking to the genie.
# The EXIT trap still tears everything down when the operator hits
# Ctrl-C.
echo ""
echo "[bottle] Running.  Press Ctrl-C to tear down the bottle."
while :; do
  sleep 3600
done
