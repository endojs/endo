#!/usr/bin/env bash

set -e

PIVOKER_DIR="$(cd "$(dirname ${BASH_SOURCE[0]}"")" && pwd)"

parse_git_ssh_url() {
  case "$1" in
    *://*)
      # ssh://user@host/path/repo.git
      if [[ $1 == ssh://* ]]; then
        hostname="${1#*://}"
        path="${hostname#*/}"
        hostname="${hostname%%/*}"
        username="${hostname%@*}"
        hostname="${hostname#*@}"
        echo "$username" "$hostname" "$path"
      fi
      ;;
    *@*)
      # user@host:path/repo.git
      username="${1%@*}"
      hostname="${1#*@}"
      path="${hostname#*:}"
      hostname="${hostname%%:*}"
      echo "$username" "$hostname" "$path"
      ;;
  esac
}

vokers() {
  git config list \
  | grep '^remote\..*\.pivoker' \
  | sed \
    -e 's/^remote\.//' \
    -e 's/\.pivoker=.*$//'
}

list_vokers() {
  declare -a names
  names=( "$@" )
  if [ "${#names[@]}" -eq 0 ]; then
    names=$(vokers)
  fi

  echo "name user host path"

  for name in "${names[@]}"; do
    git_url=$(git config "remote.${name}.url")
    url_parts=( $(parse_git_ssh_url "$git_url") )
    rem_user="${url_parts[0]}"
    rem_host="${url_parts[1]}"
    rem_path="${url_parts[2]}"
    echo "${name} ${rem_user} ${rem_host} ${rem_path}"
  done
}

within_every() {
  declare -a names
  while [ $# -gt 0 ]; do
    if [ $1 == "--" ]; then
      shift
      break
    fi
    names+=($1)
    shift
  done
  cmd="$@"
  if [ "${#names[@]}" -eq 0 ]; then
    names=$(vokers)
  fi
  for name in "${names[@]}"; do
    within "$name" "$cmd"
  done
}

within() {
  name=$1
  shift
  cmd="$@"

  git_url=$(git config "remote.${name}.url")
  url_parts=( $(parse_git_ssh_url "$git_url") )
  rem_user="${url_parts[0]}"
  rem_host="${url_parts[1]}"
  rem_path="${url_parts[2]}"

  if [ -z "$rem_host" ]; then
    echo "WARN: unsure how to enter remote.${name}"
    continue
  fi

  rem_cmd="$cmd"
  if [ -n $rem_path ]; then
    rem_cmd="bash -c 'cd "$rem_path" && $rem_cmd'"
  fi

  declare -a ssh_cmd
  ssh_cmd+=('ssh' "$rem_host")
  if [ -n "$rem_user" ]; then
    ssh_cmd+=('-l' "$rem_user")
  fi
  "${ssh_cmd[@]}" -- $rem_cmd
}

usage() {
  prog="pivoker_ctl.sh"
  echo "Usage: $prog vokers"
  echo "       $prog within [ <names> ] -- <cmd>"
  echo "       $prog status [<name>]"
  echo "       $prog log [<name>]"
  echo "       $prog run [<name>]"
}

if [ $# -eq 0 ]; then
  usage
  exit 0
fi

cmd="$1"
shift

case "$cmd" in
  vokers)
    list_vokers "$@"
    ;;

  within)
    within_every "$@"
    ;;

  status)
    if [ $# -gt 0 ]; then
      name="$1"
    else
      read name < <(vokers)
    fi
    within "$name" systemctl --user status pivoker
    ;;

  log)
    if [ $# -gt 0 ]; then
      name="$1"
    else
      read name < <(vokers)
    fi
    within "$name" journalctl --user -u pivoker "$@"
    ;;

  run)
    rem_pivker_rel=${PIVOKER_DIR#$(git rev-parse --show-toplevel)/}
    if [ $# -gt 0 ]; then
      name="$1"
    else
      read name < <(vokers)
    fi
    within "$name" ./$rem_pivker_rel/run.sh
    ;;

  *)
    {
      echo "Unknown cmd $cmd"
      echo
      usage
    } >&2
    ;;
esac
