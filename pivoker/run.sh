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

set -e

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
[ -x "$evoke_script" ] || die "Main script not found or not executable: $evoke_script"

if $DEBUG_RUN; then
  set -x
fi

check_killswitch

# --- Ensure template unit exists ---

user_conf_dir=${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user
template="$user_conf_dir/evoke@.service"

if ! [ -f "$template" ]; then
  cat <<EOF >"$template"
[Unit]
Description=AI Evoker Within %i Project
CollectMode=inactive-or-failed

[Service]
Type=exec
Slice=background.slice
SendSIGHUP=yes
WorkingDirectory=%h/%i
ExecStart=$evoke_script
EOF
  systemctl --user daemon-reload
fi

# --- Apply per-repo drop-in overrides if needed ---

needs_reload=false
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
  [ -d "$dropins" ] || mkdir -p "$dropins"
  cat <<EOF >"$dropins/worktree.conf"
[Service]
WorkingDirectory=$REPO_DIR
EOF
  needs_reload=true
fi

# ExecStart:
# - the template provides a distro default path to evoke.sh
# - but if the repository ships its own version of evoke.sh, use it
unit_exec=$(unit_prop ExecStart | grep -o 'path=[^ ]*')
unit_exec=${unit_exec#path=}
if [[ "$unit_exec" != "$evoke_script" ]]; then
  [ -d "$dropins" ] || mkdir -p "$dropins"
  cat <<EOF >"$dropins/repo_script.conf"
[Service]
ExecStart=
ExecStart=$evoke_script
EOF
  needs_reload=true
fi

if [[ $needs_reload == true ]]; then
  systemctl --user daemon-reload

  # Verify overrides took effect

  unit_workdir=$(unit_prop WorkingDirectory)
  [[ "$unit_workdir" == "$REPO_DIR" ]] \
    || die "Failed to set $UNIT_NAME WorkingDirectory to $REPO_DIR"

  unit_exec=$(unit_prop ExecStart | grep -o 'path=[^ ]*')
  unit_exec=${unit_exec#path=}
  [[ "$unit_exec" == "$evoke_script" ]] \
    || die "Failed to set $UNIT_NAME ExecStart to $evoke_script"
fi

# --- Start now or later ---

if [ -n "$AFTER" ]; then
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
      notify 'warn' "Had to stop sticky transient timer"
    else
      notify 'warn' "Unable to stop sticky transient timer"
    fi
  fi
else
  systemctl --user start "$UNIT_NAME"
fi
