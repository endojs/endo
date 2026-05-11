#!/usr/bin/env bash
#
# vigil.sh — health monitor for an evoker service.
#
# Designed to run on a recurring timer (e.g. every 5m). Checks the evoker
# systemd service for the current repo and takes corrective action:
#
#   1. If the service is active: report healthy, exit early.
#   2. If inactive and failed: restart it, notify at alert level.
#   3. If inactive (not failed) but tasks remain in the queue: trigger a run,
#      notify at info level.
#   4. If inactive, not failed, and no tasks: report idle, exit.
#
# Output is structured for human review — eventually a health report channel
# may surface this to the user.

set -euo pipefail

# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

if $DEBUG_VIGIL; then
  set -x
fi

check_killswitch

# --- helpers

tasks_pending() {
  if [[ -e "$TASKS_IN" ]]; then
    local count
    count=$(find "$TASKS_IN"/ -type f -not -name '.*' | wc -l)
    echo "$count"
    [[ "$count" -gt 0 ]]
  else
    echo 0
    return 1
  fi
}

unit_active_state() {
  systemctl --user show -P ActiveState "$UNIT_NAME" 2>/dev/null || echo "unknown"
}

unit_sub_state() {
  systemctl --user show -P SubState "$UNIT_NAME" 2>/dev/null || echo "unknown"
}

unit_result() {
  systemctl --user show -P Result "$UNIT_NAME" 2>/dev/null || echo "unknown"
}

clock_time() {
  local when="${1:-now}"
  local hour minute idx
  hour=$(date -d "$when" +%-H)   # 0-23, no leading zero
  minute=$(date -d "$when" +%-M) # 0-59, no leading zero
  hour=$((hour % 12))            # fold to 12-hour; 0 means 12
  echo "$hour" "$minute"
}

clock_emoji() {
  # Pick a clock-face emoji matching the nearest half-hour.
  # Accepts an optional time argument (any format `date -d` understands);
  # defaults to "now" when omitted.
  #
  # The Unicode clock faces run 🕐(1:00)…🕛(12:00) then 🕜(1:30)…🕧(12:30).
  hour=$1
  minute=$2
  # on-the-hour faces: U+1F550 (🕐 1:00) through U+1F55B (🕛 12:00)
  # half-past  faces: U+1F55C (🕜 1:30) through U+1F567 (🕧 12:30)
  if [[ "$minute" -lt 15 ]] || [[ "$minute" -ge 45 ]]; then
    # round to the nearest hour
    [[ "$minute" -ge 45 ]] && hour=$(((hour % 12) + 1))
    [[ "$hour" -eq 0 ]] && hour=12
    idx=$((hour - 1)) # 0-based: 0→1:00 … 11→12:00
    printf '%b' "\\U$(printf '%08X' $((0x1F550 + idx)))"
  else
    # round to the half-hour
    [[ "$hour" -eq 0 ]] && hour=12
    idx=$((hour - 1)) # 0-based: 0→1:30 … 11→12:30
    printf '%b' "\\U$(printf '%08X' $((0x1F55C + idx)))"
  fi
}

unit_journal_tail() {
  # Last N lines from the unit's journal (default 10).
  local n="${1:-10}"
  journalctl --user -u "$UNIT_NAME" -n "$n" --no-pager 2>/dev/null || true
}

unit_resource_line() {
  # Most recent "Consumed … CPU time" line from the unit's journal,
  # stripped down to a friendly multi-line summary with emoji labels.
  #
  # Input  (raw journalctl):
  #   Mar 26 00:58:52 host systemd[1923]: unit.service: Consumed 56.808s CPU time over 2h 4min 16.878s wall clock time, 217.4M memory peak.
  #
  # Output:
  #   Consumed
  #   🖥️ 56.808s
  #   🕰️ 2h 4min 16.878s
  #   ⛰️ 217.4M memory
  local raw
  raw=$(journalctl --user -u "$UNIT_NAME" --no-pager -g 'Consumed.*CPU time' -n 1 2>/dev/null || true)
  [[ -z "$raw" ]] && return

  # Extract the "Consumed …" trailer (everything after the unit name prefix).
  local consumed
  consumed=$(echo "$raw" | sed -n 's/.*Consumed /Consumed /p')
  [[ -z "$consumed" ]] && return

  # Parse out the three values.
  local cpu wall mem
  cpu=$(echo "$consumed" | sed -n 's/.*Consumed \([^ ]*\) CPU time.*/\1/p')
  wall=$(echo "$consumed" | sed -n 's/.*over \(.*\) wall clock time.*/\1/p')
  mem=$(echo "$consumed" | sed -n 's/.*, \(.*\) memory peak.*/\1/p')

  printf 'Consumed\n'
  [[ -n "$cpu" ]] && printf '🖥️ %s\n' "$cpu"
  [[ -n "$wall" ]] && printf '🕰️ %s\n' "$wall"
  [[ -n "$mem" ]] && printf '⛰️ %s memory\n' "$mem"
}

# --- main

report_time="$(date -Iseconds)"
# shellcheck disable=SC2046 # word splitting is intentional to pass hour and minute as separate args
echo "$(clock_emoji $(clock_time "$report_time")) time $report_time"

echo "🔍 checking $UNIT_NAME"

active_state=$(unit_active_state)
sub_state=$(unit_sub_state)
result=$(unit_result)

echo "📊 ActiveState=$active_state SubState=$sub_state Result=$result"

# 1. Active — healthy, nothing to do
if [[ "$active_state" = "active" ]] || [[ "$active_state" = "activating" ]]; then
  res_line=$(unit_resource_line)
  echo "✅ service is running — healthy"
  [[ -n "$res_line" ]] && printf '📈 %s\n' "$res_line"
  exit 0
fi

# 2. Failed — restart and alert
if [[ "$result" = "exit-code" ]] || [[ "$result" = "signal" ]] || [[ "$result" = "timeout" ]] || [[ "$result" = "core-dump" ]]; then
  pending=$(tasks_pending || echo 0)
  echo "🔴 service FAILED (Result=$result) — restarting ($pending task(s) pending)"
  echo "📜 last 10 journal lines:"
  unit_journal_tail 10 | while IFS= read -r line; do
    echo "    $line"
  done

  # Reset the failed state so we can start it again
  systemctl --user reset-failed "$UNIT_NAME" 2>/dev/null || true

  "$PIVOKER_DIR/run.sh"
  notify 'error' "vigil: restarted failed evoker (Result=$result, $pending pending)"
  echo "🔄 restarted after failure"
  exit 0
fi

# 3. Inactive, not failed — check if there's work to do
if pending=$(tasks_pending) && [[ "$pending" -gt 0 ]]; then
  echo "⚠️ service idle but $pending task(s) pending — triggering run"
  echo "📜 last 10 journal lines:"
  unit_journal_tail 10 | while IFS= read -r line; do
    echo "    $line"
  done

  "$PIVOKER_DIR/run.sh"
  notify 'running' "vigil: triggered idle evoker ($pending pending)"
  echo "🔄 triggered run for pending tasks"
  exit 0
fi

# 4. Truly idle — no failure, no pending work
res_line=$(unit_resource_line)
echo "💤 service idle, no pending tasks — all clear"
if [[ -n "$res_line" ]]; then
  printf '📈 %s\n' "$res_line"
fi
