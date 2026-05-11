#!/usr/bin/env bash
#
# Runs evoke.sh as a systemd user service
#
# Usage: ./run.sh [--after DURATION]
#
# With no arguments, starts the service immediately.
# With --after, schedules a one-shot timer (e.g. --after 5min).
#
# Runs in a user background service called `evoke@<repo_name>.service`,
# where <repo_name> is normalized from the repo's path relative to $HOME
# (e.g. "whatever-project" from /home/user/whatever/project).
#
# Useful commands:
#   $ systemctl --user status evoke@<repo_name>
#   $ journalctl --user -u evoke@<repo_name>

set -euo pipefail

# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

AFTER=

while [[ $# -gt 0 ]]; do
  case $1 in
    --after)
      shift
      AFTER="$1"
      shift
      ;;
    *)
      die "Invalid arg '$1'"
      ;;
  esac
done

evoke_script="$PIVOKER_DIR/evoke.sh"
[[ -x "$evoke_script" ]] || die "Main script not found or not executable: $evoke_script"

if $DEBUG_RUN; then
  set -x
fi

check_killswitch

# --- Helpers: template rendering and content-aware writes ---

# write_if_changed PATH CONTENT — writes only when content differs.
# Prints "created", "updated", or "skipped" to stdout.
write_if_changed() {
  local path="$1" content="$2"
  if ! [[ -f "$path" ]]; then
    printf '%s' "$content" >"$path"
    echo "created"
    return
  fi
  local existing
  existing=$(<"$path")
  if [[ "$existing" == "$content" ]]; then
    echo "skipped"
    return
  fi
  printf '%s' "$content" >"$path"
  echo "updated"
}

render_unit() {
  local exec_start="$1"
  printf '%s' "\
[Unit]
Description=AI Evoker Within %i Project
CollectMode=inactive-or-failed

[Service]
Type=exec
Slice=background.slice
SendSIGHUP=yes
WorkingDirectory=%h/%i
ExecStart=$exec_start
"
}

render_worktree_dropin() {
  local workdir="$1"
  printf '%s' "\
[Service]
WorkingDirectory=$workdir
"
}

render_exec_dropin() {
  local exec_start="$1"
  printf '%s' "\
[Service]
ExecStart=
ExecStart=$exec_start
"
}

# --- Ensure template unit exists and is up to date ---

user_conf_dir=${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user
template="$user_conf_dir/evoke@.service"

needs_reload=false

result=$(write_if_changed "$template" "$(render_unit "$evoke_script")")
if [[ "$result" != "skipped" ]]; then
  needs_reload=true
fi

# --- Apply per-repo drop-in overrides if needed ---

dropins="$user_conf_dir/${UNIT_NAME}.service.d"

unit_prop() {
  systemctl --user show -P "$1" "$UNIT_NAME"
}

# WorkingDirectory:
# - the template uses %h/%i
# - which only works when $REPO_NAME has no path separators that differ from the
#   instance name encoding.
unit_workdir=$(unit_prop WorkingDirectory)
if [[ "$unit_workdir" != "$REPO_DIR" ]]; then
  [[ -d "$dropins" ]] || mkdir -p "$dropins"
  result=$(write_if_changed "$dropins/worktree.conf" "$(render_worktree_dropin "$REPO_DIR")")
  if [[ "$result" != "skipped" ]]; then
    needs_reload=true
  fi
fi

# ExecStart:
# - the template provides a distro default path to evoke.sh
# - but if the repository ships its own version of evoke.sh, use it
unit_exec=$(unit_prop ExecStart | grep -o 'path=[^ ]*')
unit_exec=${unit_exec#path=}
if [[ "$unit_exec" != "$evoke_script" ]]; then
  [[ -d "$dropins" ]] || mkdir -p "$dropins"
  result=$(write_if_changed "$dropins/repo_script.conf" "$(render_exec_dropin "$evoke_script")")
  if [[ "$result" != "skipped" ]]; then
    needs_reload=true
  fi
fi

if [[ $needs_reload == true ]]; then
  systemctl --user daemon-reload

  # Verify overrides took effect

  unit_workdir=$(unit_prop WorkingDirectory)
  [[ "$unit_workdir" == "$REPO_DIR" ]] ||
    die "Failed to set $UNIT_NAME WorkingDirectory to $REPO_DIR"

  unit_exec=$(unit_prop ExecStart | grep -o 'path=[^ ]*')
  unit_exec=${unit_exec#path=}
  [[ "$unit_exec" == "$evoke_script" ]] ||
    die "Failed to set $UNIT_NAME ExecStart to $evoke_script"
fi

# --- Start now or later ---

if [[ -n "$AFTER" ]]; then
  if ! systemd-run --user --on-active="$AFTER" --unit="$UNIT_NAME" --collect --no-block; then
    # XXX
    did=false
    if systemctl --user stop "${UNIT_NAME}.timer"; then
      did=true
    fi
    if ! systemd-run --user --on-active="$AFTER" --unit="$UNIT_NAME" --collect --no-block; then
      systemctl --user list-timers
      die "FAILED to arm run timer"
    elif $did; then
      notify 'error' "Had to stop sticky transient timer"
    else
      notify 'error' "Unable to stop sticky transient timer"
    fi
  fi
else
  systemctl --user start "$UNIT_NAME"
fi
