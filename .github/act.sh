#!/bin/sh

set -eu

usage() {
  cat <<'USAGE'
Usage: .github/act.sh [preset [act args...]|run-suite preset...|act args...]

Run GitHub Actions locally with act, forwarding the current GitHub credential
without writing it into the repository.
Use run-suite to run one or more preset names sequentially in the given order.

Defaults:
  event:       pull_request
  workflow:   .github/workflows/ci.yml
  base branch: master

Environment overrides:
  ACT_EVENT           Event name to run. Default: pull_request
  ACT_WORKFLOW        Workflow file or directory. Default: .github/workflows/ci.yml
  ACT_JOB             Job id to run, equivalent to passing -j.
  ACT_EVENT_PATH      Existing event JSON file to use instead of a generated one.
  ACT_SECRET_FILE     Extra act secrets file to pass before the generated token file.
  ACT_DEFAULT_BRANCH  Default branch for act. Default: master
  ACT_PLATFORM        Docker image for ubuntu-latest. Default: catthehacker/ubuntu:full-latest
  ACT_CACHE_ROOT      act cache root. Default: /tmp/endo-act-cache
  ACT_TOOL_CACHE      Tool cache path inside the act container. Default: /tmp/endo-act-toolcache
  ACT_CONTAINER_ARCH  Docker container architecture. Default: linux/amd64
  ACT_CONTAINER_OPTIONS
                      Extra Docker options for the job container. By default,
                      this script mounts the Git common directory when needed.
  ACT_ENABLE_SERVERS  Set to 1 to enable act cache/artifact servers. Default: 0
  ACT_SERVER_ADDR     act cache/artifact bind address. Default: 127.0.0.1
  ACT_DRYRUN          Set to 1 to append --dryrun.
  GH_TOKEN            GitHub token to pass as GITHUB_TOKEN.
  GITHUB_TOKEN        GitHub token to pass as GITHUB_TOKEN.

Presets:
  list          List the main CI workflow jobs.
  lint          Run the CI lint job.
  test22        Run the CI test job for Node 22 on Ubuntu.
  test24        Run the CI test job for Node 24 on Ubuntu.
  cover         Run the CI coverage job.
  test262-22    Run the CI test262 job for Node 22 on Ubuntu.
  test262-24    Run the CI test262 job for Node 24 on Ubuntu.
  test-hermes   Run the CI Hermes smoke-test job.
  depcheck      Run the dependency-cycle workflow.
  zizmor        Run the workflow security audit.
  ci-core       Run these practical local CI presets in sequence:
                lint, test22, test24, cover, test262-22, test262-24,
                test-hermes, depcheck.
                Excludes zizmor because it fetches a nested CodeQL action and
                may hang.
  ci-heavy      Run these expensive or more environment-sensitive CI jobs in
                sequence: viable-release, test-xs, test-ocapn-python, browser.

Examples:
  .github/act.sh lint
  ACT_DRYRUN=1 .github/act.sh ci-core
  .github/act.sh run-suite ci-core ci-heavy
  .github/act.sh test22
  .github/act.sh --list
  ACT_WORKFLOW=.github/workflows/browser-test.yml .github/act.sh -j browser-tests

Notes:
  - Temporary GitHub advisory forks do not run GitHub-hosted CI. This script is
    for local emulation.
  - act cannot faithfully emulate macOS runners on a Linux container. Prefer
    selecting Ubuntu matrix entries when running matrix jobs locally.
USAGE
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

if ! command -v act >/dev/null 2>&1; then
  echo "error: act is not installed or is not on PATH" >&2
  exit 127
fi

repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"

run_suite() {
  for preset in "$@"; do
    echo "==> .github/act.sh $preset"
    .github/act.sh "$preset"
  done
  exit 0
}

case "${1:-}" in
  run-suite)
    shift
    if [ "$#" -eq 0 ]; then
      echo "error: run-suite requires at least one preset" >&2
      usage >&2
      exit 2
    fi
    run_suite "$@"
    ;;
  list)
    shift
    set -- --list "$@"
    ;;
  lint)
    shift
    set -- --job lint "$@"
    ;;
  test22)
    shift
    set -- --job test --matrix node-version:22.x --matrix platform:ubuntu-latest "$@"
    ;;
  test24)
    shift
    set -- --job test --matrix node-version:24.x --matrix platform:ubuntu-latest "$@"
    ;;
  cover)
    shift
    set -- --job cover "$@"
    ;;
  test262-22)
    shift
    set -- --job test262 --matrix node-version:22.x --matrix platform:ubuntu-latest "$@"
    ;;
  test262-24)
    shift
    set -- --job test262 --matrix node-version:24.x --matrix platform:ubuntu-latest "$@"
    ;;
  test-hermes)
    shift
    set -- --job test-hermes "$@"
    ;;
  depcheck)
    shift
    ACT_WORKFLOW=.github/workflows/depcheck.yml
    export ACT_WORKFLOW
    set -- --job build "$@"
    ;;
  zizmor)
    shift
    ACT_WORKFLOW=.github/workflows/zizmor.yml
    export ACT_WORKFLOW
    set -- --job zizmor "$@"
    ;;
  ci-core)
    shift
    run_suite lint test22 test24 cover test262-22 test262-24 test-hermes depcheck
    ;;
  ci-heavy)
    shift
    run_suite viable-release test-xs test-ocapn-python browser
    ;;
  viable-release)
    shift
    set -- --job viable-release "$@"
    ;;
  test-xs)
    shift
    set -- --job test-xs "$@"
    ;;
  test-ocapn-python)
    shift
    set -- --job test-ocapn-python "$@"
    ;;
  browser)
    shift
    ACT_WORKFLOW=.github/workflows/browser-test.yml
    ACT_ENABLE_SERVERS=${ACT_ENABLE_SERVERS:-1}
    export ACT_WORKFLOW
    export ACT_ENABLE_SERVERS
    set -- --job browser-tests "$@"
    ;;
esac

event=${ACT_EVENT:-pull_request}
workflow=${ACT_WORKFLOW:-.github/workflows/ci.yml}
default_branch=${ACT_DEFAULT_BRANCH:-master}
platform=${ACT_PLATFORM:-catthehacker/ubuntu:full-latest}
cache_root=${ACT_CACHE_ROOT:-/tmp/endo-act-cache}
tool_cache=${ACT_TOOL_CACHE:-/tmp/endo-act-toolcache}
container_arch=${ACT_CONTAINER_ARCH:-linux/amd64}
enable_servers=${ACT_ENABLE_SERVERS:-0}
mkdir -p "$cache_root/actions" "$cache_root/cache" "$cache_root/artifacts"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$cache_root/xdg}"

container_options=${ACT_CONTAINER_OPTIONS:-}
git_common_dir=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || git rev-parse --git-common-dir)
if [ -d "$git_common_dir" ]; then
  # Act copies the worktree without the out-of-tree Git metadata used by
  # worktrees, but package scripts such as `git clean` still need it.
  container_options="${container_options:+$container_options }-v $git_common_dir:$git_common_dir"
fi

tmpdir=$(mktemp -d "${TMPDIR:-/tmp}/endo-act.XXXXXX")
cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT INT TERM

token=${GITHUB_TOKEN:-${GH_TOKEN:-}}
if [ -z "$token" ] && command -v gh >/dev/null 2>&1; then
  token=$(gh auth token 2>/dev/null || true)
fi

secret_file=$tmpdir/secrets
if [ -n "$token" ]; then
  umask 077
  {
    printf 'GITHUB_TOKEN=%s\n' "$token"
    printf 'GH_TOKEN=%s\n' "$token"
  } > "$secret_file"
else
  : > "$secret_file"
  echo "warning: no GITHUB_TOKEN, GH_TOKEN, or gh auth token available" >&2
fi

if [ -n "${ACT_EVENT_PATH:-}" ]; then
  event_path=$ACT_EVENT_PATH
else
  event_path=$tmpdir/event.json
  branch=$(git branch --show-current)
  head_sha=$(git rev-parse HEAD)
  repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || git config --get remote.origin.url)

  cat > "$event_path" <<EOF
{
  "repository": {
    "full_name": "$repo"
  },
  "pull_request": {
    "base": {
      "ref": "$default_branch"
    },
    "head": {
      "ref": "$branch",
      "sha": "$head_sha"
    }
  },
  "ref": "refs/heads/$branch",
  "after": "$head_sha"
}
EOF
fi

set -- "$event" \
  --workflows "$workflow" \
  --eventpath "$event_path" \
  --defaultbranch "$default_branch" \
  --secret-file "$secret_file" \
  --env "YARN_GLOBAL_FOLDER=$repo_root/.yarn/act-global" \
  --env "RUNNER_TOOL_CACHE=$tool_cache" \
  --action-cache-path "$cache_root/actions" \
  --container-architecture "$container_arch" \
  --platform "ubuntu-latest=$platform" \
  --platform "ubuntu-22.04=$platform" \
  "$@"

if [ -n "$container_options" ]; then
  set -- "$@" --container-options "$container_options"
fi

if [ "$enable_servers" = "1" ]; then
  server_addr=${ACT_SERVER_ADDR:-127.0.0.1}
  set -- "$@" \
    --cache-server-path "$cache_root/cache" \
    --cache-server-addr "$server_addr" \
    --artifact-server-path "$cache_root/artifacts" \
    --artifact-server-addr "$server_addr"
else
  set -- "$@" --no-cache-server
fi

if [ -n "${ACT_SECRET_FILE:-}" ]; then
  set -- "$@" --secret-file "$ACT_SECRET_FILE"
fi

if [ -n "${ACT_JOB:-}" ]; then
  set -- "$@" --job "$ACT_JOB"
fi

if [ "${ACT_DRYRUN:-0}" = "1" ]; then
  set -- "$@" --dryrun
fi

exec act "$@"
