#!/bin/bash
# Run Endo OS in Docker with optional mounts.
#
# Usage:
#   ./run.sh
#   ./run.sh --mount docs=/path/to/dir
#   ./run.sh --mount home=$HOME --mount repo=$(pwd)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BINARY="${SCRIPT_DIR}/out/endo-init"

if [ ! -f "$BINARY" ]; then
  echo "Binary not found. Run ./redox/build/build-redox.sh first."
  exit 1
fi

# Build docker args: mount the binary + any user-specified dirs.
DOCKER_ARGS="-v ${BINARY}:/tmp/ei:ro"
ENDO_ARGS=""

while [ $# -gt 0 ]; do
  case "$1" in
    --mount)
      shift
      # Parse name=path
      NAME="${1%%=*}"
      PATH_VAL="${1#*=}"
      # Resolve to absolute path
      ABS_PATH="$(cd "$PATH_VAL" 2>/dev/null && pwd || echo "$PATH_VAL")"
      DOCKER_ARGS="${DOCKER_ARGS} -v ${ABS_PATH}:/mnt/${NAME}:ro"
      ENDO_ARGS="${ENDO_ARGS} --mount ${NAME}=/mnt/${NAME}"
      shift
      ;;
    --port)
      shift
      ENDO_ARGS="${ENDO_ARGS} --port $1"
      DOCKER_ARGS="${DOCKER_ARGS} -p $1:$1"
      shift
      ;;
    *)
      shift
      ;;
  esac
done

exec docker run --rm -it ${DOCKER_ARGS} ubuntu:24.04 \
  sh -c "cp /tmp/ei /endo && chmod +x /endo && exec /endo ${ENDO_ARGS}"
