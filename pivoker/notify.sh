#!/usr/bin/env bash
#
# Usage: notify.sh [--key value ...] <message...>
# Sends a notification via the configured NOTIFY backend.

set -euo pipefail

# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

# --- parse --key value parameters from $@

param_keys=()
param_vals=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --*)
      param_keys+=("${1#--}")
      param_vals+=("${2-}")
      shift 2
      ;;
    *)
      break
      ;;
  esac
done

message="$*"
[[ -n "$message" ]] || exit 0

if [[ -z "$NOTIFY" ]]; then
  echo "NOTIFY: $message"
  exit 0
fi

curl=('curl' '-sf')
if $DEBUG_NOTIFY; then
  curl+=('-v')
  set -x
fi

# If NOTIFY points to a file in the repo, delegate to it
if [[ -x "$REPO_DIR/$NOTIFY" ]]; then
  param_args=()
  for i in "${!param_keys[@]}"; do
    param_args+=("--${param_keys[$i]}" "${param_vals[$i]}")
  done
  exec "$REPO_DIR/$NOTIFY" "${param_args[@]}" "$message"
elif [[ -e "$REPO_DIR/$NOTIFY" ]]; then
  NOTIFY="file://$REPO_DIR/$NOTIFY"
fi

# --- build JSON body using jq

jq_args=(--arg time "$(date -u -Iseconds)")
jq_args+=(--arg message "$message")
for i in "${!param_keys[@]}"; do
  jq_args+=(--arg "${param_keys[$i]}" "${param_vals[$i]}")
done
json=$(jq -nc "${jq_args[@]}" '$ARGS.named')

# --- dispatch by protocol

case "$NOTIFY" in

  # HTTP(S): POST JSON
  http://* | https://*)
    "${curl[@]}" -X POST -H 'Content-Type: application/json' -d "$json" "$NOTIFY"
    exit $?
    ;;

  # file:///path — write JSON to a file, directory, pipe, or socket
  file:///*)

    path=$(chase_file "${NOTIFY#file://}")
    if [[ -d "$path" ]]; then
      stamp=$(date -Iseconds | tr -d ':-' | sed 's/+.*//; s/_/T/')
      printf '%s' "$json" >"$path/${stamp}.json"
    elif [[ -p "$path" ]] || [[ -S "$path" ]]; then
      printf '%s' "$json" >"$path"
    else
      # Regular file (or doesn't exist yet): append
      printf '%s' "$json" >>"$path"
    fi
    ;;

  *)
    die "Unsupported NOTIFY=$NOTIFY ; expected an http, https, or file URL"
    ;;

esac
