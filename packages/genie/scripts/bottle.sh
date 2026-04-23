#!/usr/bin/env bash
# @endo/genie bottle shell recipe — Phase 0
#
# Two-mode operator utility for the "genie in a bottle" deployment shape
# described in PLAN/genie_in_bottle.md.  The bottle itself is a long-lived
# Endo daemon on some host — not a throwaway test fixture — hosting a root
# genie agent that the operator attaches to via invite/accept.
#
# Modes:
#   invoke    Runs INSIDE the bottle.  Brings up an endo daemon under the
#             invoking user's own XDG paths, installs a network transport,
#             runs genie setup.js (which spawns the root genie directly on
#             the daemon's host agent — the worker's inbox is `@self`, no
#             intermediate guest or form-submission step — driven by
#             GENIE_MODEL / GENIE_WORKSPACE env), issues `endo invite owner`
#             at the host level, and prints the locator for the operator
#             to accept.  The daemon survives the script; tear-down is the
#             operator's responsibility (e.g. `endo stop` or the systemd
#             unit landed in Phase 4).
#
#   evoke     Runs on the OPERATOR's workstation.  Reaches into a remote
#             SSH target, puts a copy of the endo CLI on that host (either
#             by git-pushing the current checkout to a bare repo on the
#             remote and running `yarn install`, or by invoking
#             `yarn global add github:endojs/endo#<branch>`), then runs
#             `bottle.sh invoke` inside that host with any pass-through
#             arguments.
#
# This is the Phase 0 composition proof: everything is stitched from
# primitives that already exist, so the later phases (R2 --owner flag,
# R3 primordial genie, systemd unit, sd_notify, etc.) can replace these
# pieces one at a time.  See PLAN/genie_in_bottle.md for the surrounding
# design and TODO/81_genie_bottle_phase0_shell.md for the scope that
# this script implements.
#
# Usage:
#   ./packages/genie/scripts/bottle.sh invoke [options]
#   ./packages/genie/scripts/bottle.sh evoke  [options] <user@host>
#   ./packages/genie/scripts/bottle.sh --help
#
# Invoke options:
#   --transport=(libp2p|tcp|both)
#                       transport(s) to bring up. Default: libp2p.
#   --workspace=<path>  genie workspace directory.
#                       Default: $XDG_DATA_HOME/endo/genie/workspace.
#   --listen=<host:port> TCP listen address.
#                       Default: 127.0.0.1:0 (OS-assigned ephemeral port).
#   -E KEY=VAL          Set an environment variable.  Repeatable.
#   -f <env-file>       Source a file of `export KEY=VAL` lines.
#   --help              Show this help and exit 0.
#
# Evoke options:
#   --install=(push|yarn-global|none)
#                       How to get endo onto the remote (default: push).
#                       push        git-push this checkout to a bare repo
#                                   on the remote, then `yarn install` in
#                                   a work tree.
#                       yarn-global run `yarn global add github:endojs/endo#<branch>`
#                                   on the remote (see caveats in
#                                   PLAN/genie_in_bottle.md § 2 _install_).
#                       none        assume endo is already on the remote
#                                   PATH; just run bottle.sh there.
#   --ref=<ref>         Local git ref to push.  Default: HEAD.
#   --branch=<name>     Remote branch name to land the push on.
#                       Default: bottle.
#   --remote-bare=<p>   Remote bare-repo path.  Default: $HOME/endo.git.
#   --remote-work=<p>   Remote work-tree path.  Default: $HOME/endo.
#   --help              Show this help and exit 0.
#
# Arguments after `--` are passed through to `bottle.sh invoke` on the
# remote side.
#
# Required environment for `invoke`:
#   GENIE_MODEL         LLM model spec, e.g. ollama/llama3.2.
#                       Phase 2 will let the owner hand model credentials
#                       in over the invite edge instead; for Phase 0 we
#                       still require it up front.  For `evoke`, export
#                       GENIE_MODEL locally and pass it through with
#                       `-- -E GENIE_MODEL=$GENIE_MODEL`.
#
# Exit status:
#   0  success (owner attached on invoke, or evoke handed off cleanly)
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
# Help / usage
# ---------------------------------------------------------------------------

# Print the leading comment block (stripping the leading `# `).  The block
# ends at the first non-comment line.
usage() {
  awk '
    NR == 1 { next }                        # skip shebang
    /^[^#]/ { exit }                        # stop at first non-comment line
    { sub(/^# ?/, ""); print }
  ' "${BASH_SOURCE[0]}"
}

log() {
  echo "[bottle] $*"
}

die() {
  echo "[bottle] ERROR: $*" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# Mode dispatch
# ---------------------------------------------------------------------------

MODE="${1:-}"
case "$MODE" in
  invoke|evoke)
    shift
    ;;
  --help|-h|help)
    usage
    exit 0
    ;;
  '')
    echo "[bottle] ERROR: no mode specified" >&2
    echo "Run '$0 --help' for usage." >&2
    exit 1
    ;;
  *)
    echo "[bottle] ERROR: unknown mode: $MODE" >&2
    echo "Run '$0 --help' for usage." >&2
    exit 1
    ;;
esac

# ===========================================================================
# Mode: evoke — runs on the operator's workstation, reaches into the bottle.
# ===========================================================================

run_evoke() {
  local install_method="push"
  local local_ref="HEAD"
  local remote_branch="bottle"
  local remote_bare='$HOME/endo.git'
  local remote_work='$HOME/endo'
  local github_slug="endojs/endo"
  local target=""
  local -a passthrough=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --help|-h)
        usage
        exit 0
        ;;

      --install=*)
        install_method="${1#--install=}"
        shift
        ;;
      --install)
        shift
        install_method="${1:-}"
        [[ -n "$install_method" ]] || die "--install needs a value"
        shift
        ;;

      --ref=*)
        local_ref="${1#--ref=}"
        shift
        ;;
      --ref)
        shift
        local_ref="${1:-}"
        [[ -n "$local_ref" ]] || die "--ref needs a value"
        shift
        ;;

      --branch=*)
        remote_branch="${1#--branch=}"
        shift
        ;;
      --branch)
        shift
        remote_branch="${1:-}"
        [[ -n "$remote_branch" ]] || die "--branch needs a value"
        shift
        ;;

      --remote-bare=*)
        remote_bare="${1#--remote-bare=}"
        shift
        ;;
      --remote-bare)
        shift
        remote_bare="${1:-}"
        [[ -n "$remote_bare" ]] || die "--remote-bare needs a value"
        shift
        ;;

      --remote-work=*)
        remote_work="${1#--remote-work=}"
        shift
        ;;
      --remote-work)
        shift
        remote_work="${1:-}"
        [[ -n "$remote_work" ]] || die "--remote-work needs a value"
        shift
        ;;

      --)
        shift
        passthrough+=("$@")
        break
        ;;

      -*)
        die "unknown evoke flag: $1"
        ;;

      *)
        if [[ -z "$target" ]]; then
          target="$1"
          shift
        else
          # positional args after the target are pass-through to invoke
          passthrough+=("$1")
          shift
        fi
        ;;
    esac
  done

  [[ -n "$target" ]] || die "evoke needs a <user@host> target"

  case "$install_method" in
    push|yarn-global|none) ;;
    *) die "--install must be one of push|yarn-global|none (got '$install_method')" ;;
  esac

  cat <<EOF
=== genie in a bottle (Phase 0) — evoke ===
 target        : $target
 install       : $install_method
 local ref     : $local_ref
 remote branch : $remote_branch
 remote bare   : $remote_bare
 remote work   : $remote_work
 passthrough   : ${passthrough[*]:-(none)}
============================================
EOF

  case "$install_method" in
    push)
      log "Ensuring remote bare repo at $remote_bare exists..."
      # shellcheck disable=SC2029  # we want $remote_bare expanded on the remote
      ssh "$target" "bash -lc 'set -e
        bare=$remote_bare
        if [ ! -d \"\$bare\" ]; then
          echo \"[bottle:remote] initializing bare repo at \$bare\"
          git init --bare \"\$bare\" >/dev/null
        fi
      '"

      log "Pushing $local_ref → $target:$remote_bare ($remote_branch)..."
      # The remote bare path contains `$HOME`; git-over-ssh resolves it
      # via the login shell, so use the `ssh://` URL form and let the
      # shell expand.  We quote carefully so the remote sees the raw
      # `$HOME` and expands it itself.
      git push --force \
        "${target}:${remote_bare}" \
        "${local_ref}:refs/heads/${remote_branch}"

      log "Checking out work tree on remote..."
      # shellcheck disable=SC2029
      ssh "$target" "bash -lc 'set -e
        bare=$remote_bare
        work=$remote_work
        branch=$remote_branch
        if [ ! -d \"\$work/.git\" ]; then
          echo \"[bottle:remote] cloning \$bare into \$work\"
          git clone \"\$bare\" \"\$work\"
        fi
        cd \"\$work\"
        git fetch origin
        git checkout -B \"\$branch\" \"origin/\$branch\"
        echo \"[bottle:remote] installing deps via corepack yarn\"
        corepack yarn install --immutable >/dev/null
      '"
      ;;

    yarn-global)
      log "Installing endo on remote via yarn global (github:$github_slug#$remote_branch)..."
      # NOTE: the repo root is `"private": true`, so this may fail to
      # link the `endo` bin until Phase 3 resolves the install story.
      # See PLAN/genie_in_bottle.md § 2 _install_.
      # shellcheck disable=SC2029
      ssh "$target" "bash -lc 'set -e
        corepack yarn global add github:${github_slug}#${remote_branch}
      '"
      ;;

    none)
      log "--install=none; assuming endo is already on remote PATH."
      ;;
  esac

  log "Running bottle.sh invoke on remote..."
  local remote_script
  case "$install_method" in
    push)
      remote_script="$remote_work/packages/genie/scripts/bottle.sh"
      ;;
    yarn-global|none)
      # Fall back to the script shipped inside the yarn-global checkout.
      # yarn global installs into ~/.yarn/berry or similar — we cannot
      # assume a stable path for the script from here, so the operator
      # must have the script reachable some other way (e.g. scp-ed, or
      # the remote has its own checkout).  We print a hint.
      remote_script='$HOME/endo/packages/genie/scripts/bottle.sh'
      log "WARN: --install=$install_method does not place bottle.sh on the"
      log "      remote; expected it at $remote_script.  Copy it there or"
      log "      use --install=push for the bring-your-own-repo flow."
      ;;
  esac

  # Build the remote command.  We pass the passthrough args as a single
  # shell-quoted string.
  local quoted_passthrough=""
  if ((${#passthrough[@]})); then
    quoted_passthrough="$(printf '%q ' "${passthrough[@]}")"
  fi

  # shellcheck disable=SC2029
  exec ssh -t "$target" "bash -lc 'set -e
    cd $remote_work 2>/dev/null || true
    export PATH=$remote_work/packages/cli/bin:\$PATH
    exec $remote_script invoke $quoted_passthrough
  '"
}

# ===========================================================================
# Mode: invoke — runs inside the bottle.
# ===========================================================================

run_invoke() {
  local transport="libp2p"
  local workspace_arg=""
  local listen_addr_arg="127.0.0.1:0"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --help|-h)
        usage
        exit 0
        ;;

      --transport=*)
        transport="${1#--transport=}"
        shift
        ;;
      --transport)
        shift
        transport="${1:-}"
        [[ -n "$transport" ]] || die "--transport needs a value"
        shift
        ;;

      --workspace=*)
        workspace_arg="${1#--workspace=}"
        shift
        ;;
      --workspace)
        shift
        workspace_arg="${1:-}"
        shift
        ;;

      --listen=*)
        listen_addr_arg="${1#--listen=}"
        shift
        ;;
      --listen)
        shift
        listen_addr_arg="${1:-}"
        shift
        ;;

      -f)
        shift
        if [[ -z "${1:-}" || ! -f "$1" ]]; then
          die "-f requires a readable env-file path"
        fi
        log "Loading env from $1"
        # shellcheck disable=SC1090
        set -a
        source "$1"
        set +a
        shift
        ;;

      -E)
        shift
        if [[ -z "${1:-}" || "$1" != *=* ]]; then
          die "-E requires KEY=VAL argument"
        fi
        export "$1"
        log "Set ${1%%=*}"
        shift
        ;;

      *)
        echo "[bottle] ERROR: Unknown invoke option: $1" >&2
        echo "Run '$0 --help' for usage." >&2
        exit 1
        ;;
    esac
  done

  case "$transport" in
    libp2p|tcp|both) ;;
    *)
      die "--transport must be one of libp2p|tcp|both (got '$transport')"
      ;;
  esac

  # Validate required configuration.
  if [[ -z "${GENIE_MODEL:-}" ]]; then
    echo "[bottle] ERROR: GENIE_MODEL is not set." >&2
    echo "  Set it via environment, -f <env-file>, or -E GENIE_MODEL=<spec>." >&2
    echo "  (Phase 2 will let the owner hand model credentials in over the" >&2
    echo "   invite edge instead; for Phase 0 we still require it up front.)" >&2
    exit 1
  fi

  # Workspace selection.  We land under the invoking user's own XDG data
  # tree by default — the bottle is NOT a throwaway sandbox; the workspace
  # must survive across runs so the genie's memory (HEARTBEAT.md,
  # MEMORY.md, .genie/) persists.  See PLAN/genie_in_bottle.md § 1 _where_.
  local workspace
  if [[ -n "$workspace_arg" ]]; then
    workspace="$workspace_arg"
  elif [[ -n "${GENIE_WORKSPACE:-}" ]]; then
    workspace="$GENIE_WORKSPACE"
  else
    workspace="${XDG_DATA_HOME:-$HOME/.local/share}/endo/genie/workspace"
    log "GENIE_WORKSPACE unset — using default $workspace"
  fi

  mkdir -p "$workspace"

  export ENDO_ADDR="$listen_addr_arg"
  export GENIE_WORKSPACE="$workspace"
  export GENIE_MODEL

  local pending_invite_file="$workspace/PENDING_OWNER_INVITE"

  cat <<EOF

=== genie in a bottle (Phase 0) — invoke ===
 transport : $transport
 workspace : $workspace
 listen    : $ENDO_ADDR
 model     : $GENIE_MODEL
=============================================

EOF

  # -------------------------------------------------------------------------
  # Start daemon and wait for ping.
  #
  # `endo start` is idempotent: if a daemon is already running under the
  # invoking user's XDG_RUNTIME dirs, this just returns.  We never purge
  # existing state — the bottle daemon is meant to outlive any one
  # turn-up.  Phase 4 lands a systemd unit that replaces this call.
  # -------------------------------------------------------------------------

  echo "=== Phase 1: Start daemon ==="
  endo start

  log "Waiting for daemon to become ready..."
  local daemon_ready=0
  local i
  for i in $(seq 1 30); do
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
  log "Daemon started and ready."

  # -------------------------------------------------------------------------
  # Transport turnup.  These steps are idempotent on re-run: `endo store`
  # and `endo make --name` will fail if the name is taken, which is fine
  # — the bottle just needs the network under @nets/<transport>.
  # -------------------------------------------------------------------------

  install_libp2p() {
    if endo locate @nets/libp2p >/dev/null 2>&1; then
      log "@nets/libp2p already present; skipping libp2p turnup."
      return
    fi
    log "Installing libp2p transport at @nets/libp2p..."
    endo run --UNCONFINED \
      "$DAEMON_PKG/src/networks/setup-libp2p.js" \
      --powers @agent
  }

  install_tcp() {
    if endo locate @nets/tcp >/dev/null 2>&1; then
      log "@nets/tcp already present; skipping TCP turnup."
      return
    fi
    log "Installing TCP transport at @nets/tcp (listen=$ENDO_ADDR)..."
    endo store --text "$ENDO_ADDR" --name tcp-listen-addr
    endo make --UNCONFINED \
      "$DAEMON_PKG/src/networks/tcp-netstring.js" \
      --powers @agent --name network-service
    endo mv network-service @nets/tcp
  }

  echo ""
  echo "=== Phase 2: Transport turnup ==="

  case "$transport" in
    libp2p) install_libp2p ;;
    tcp)    install_tcp ;;
    both)   install_libp2p; install_tcp ;;
  esac

  # -------------------------------------------------------------------------
  # Genie setup.
  #
  # `setup.js` spawns the root genie directly on the daemon's host agent
  # — the worker's inbox is `@self`, no intermediate guest or
  # form-submission step.  `makeUnconfined('@main', main.js, {
  # powersName: '@agent', env: … })` forwards the GENIE_* environment to
  # `main.js`, which validates required values and runs the agent loop
  # under the daemon's own identity.  Re-running this phase is
  # idempotent: `setup.js` short-circuits when `main-genie` is already
  # present.
  # -------------------------------------------------------------------------

  echo ""
  echo "=== Phase 3: Genie setup ==="

  endo run --UNCONFINED \
    "$PACKAGE_DIR/setup.js" --powers @agent \
    -E "GENIE_MODEL=$GENIE_MODEL" \
    -E "GENIE_WORKSPACE=$GENIE_WORKSPACE"

  log "Setup completed."

  # -------------------------------------------------------------------------
  # Owner invite.
  # -------------------------------------------------------------------------

  echo ""
  echo "=== Phase 4: Owner invite ==="

  # `endo invite owner` runs at the _host_ level (no -a @agent), so the
  # acceptor gets a peer-host handle rather than a child guest.  This is
  # the R3 shape from PLAN/genie_in_bottle.md § "Root genie (the R2+R3
  # shape)".
  local invite_locator
  invite_locator="$(endo invite owner)"
  if [[ -z "$invite_locator" ]]; then
    die "endo invite owner produced no locator"
  fi

  # Persist for polling tools / systemd consumers.
  printf '%s\n' "$invite_locator" > "$pending_invite_file"

  cat <<EOF

================= OWNER INVITE =================
 Pipe the locator below into \`endo accept\` on
 your local daemon to attach as this bottle's
 owner, e.g.:

   echo '<locator>' | endo accept bottle

 The locator is also written to:
   $pending_invite_file
 and is removed once the owner attaches.

 LOCATOR:
$invite_locator
=================================================

EOF

  # -------------------------------------------------------------------------
  # Readiness wait — poll the host inbox for the first message from a
  # non-self locator.  Phase 5 ("sd_notify") replaces this with a real
  # readiness signal.
  #
  # If --no-wait is set we just exit; the daemon keeps running in the
  # background and the operator can accept at their leisure.
  # -------------------------------------------------------------------------

  echo ""
  echo "=== Phase 5: Waiting for owner to attach ==="
  log "Tailing inbox for first non-self message..."

  local owner_attached=0
  # The inbox listing starts empty after a fresh daemon.  We intentionally
  # do not bound this wait — the operator may take minutes to accept.  An
  # interrupt (Ctrl-C) is the escape hatch.
  while :; do
    local inbox_output
    inbox_output="$(endo inbox 2>/dev/null || true)"
    if [[ -n "$inbox_output" ]]; then
      # A line whose verb is `sent` / `sent form` / `sent value` /
      # `replied to` and whose from-side is a *quoted* name (i.e.
      # rendered via reverseLocate — which for an outside peer means
      # they are in our pet store, i.e. the owner after accept).
      # `inbox.js` renders self-originated messages as `you ... yourself`,
      # so quoted-name on the left is an external sender.
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
    rm -f "$pending_invite_file"
    log "Owner attached — first message received."
    log "Removed $pending_invite_file."
  fi

  # The daemon keeps running after we return; the bottle is meant to be
  # long-lived.  The operator tears it down with `endo stop` or via the
  # Phase 4 systemd unit.
  echo ""
  log "Bottle is live.  Daemon continues running in the background."
  log "Use 'endo stop' to tear down the daemon when you're done."
}

# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

case "$MODE" in
  invoke) run_invoke "$@" ;;
  evoke)  run_evoke  "$@" ;;
esac
