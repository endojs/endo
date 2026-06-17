#!/bin/bash
# Provision the two Floot voice caplets (floot-stt + floot-tts).
#
# Usage:
#   FLOOT_TTS_MODEL=/abs/voice.onnx ./setup-voice.sh   # ambient env
#   ./setup-voice.sh                                    # reads .env if present
#   ./setup-voice.sh path/to/.env
#
# FLOOT_TTS_MODEL (absolute path to a piper .onnx voice) is required, via either
# the environment or the env file. The env file is optional since these inputs
# are filesystem paths, not secrets.
set -euo pipefail

ENV_FILE="${1:-.env}"
if [ -f "$ENV_FILE" ]; then
  set -a; source "$ENV_FILE"; set +a
fi

if [ -z "${FLOOT_TTS_MODEL:-}" ]; then
  echo "Error: FLOOT_TTS_MODEL (absolute path to a piper .onnx voice) is required." >&2
  exit 1
fi

endo run --UNCONFINED voice-setup.js --powers @agent \
  -E STT_PETNAME="${STT_PETNAME:-floot-stt}" \
  -E TTS_PETNAME="${TTS_PETNAME:-floot-tts}" \
  -E FLOOT_TTS_BINARY="${FLOOT_TTS_BINARY:-piper}" \
  -E FLOOT_TTS_MODEL="${FLOOT_TTS_MODEL:-}" \
  -E FLOOT_TTS_SPEED="${FLOOT_TTS_SPEED:-1.0}" \
  -E FLOOT_STT_LANG="${FLOOT_STT_LANG:-en}"
