#!/bin/bash
# Source an .env file and provision the two Floot voice caplets (floot-stt + floot-tts).
#
# Usage:
#   ./setup-voice.sh            # reads .env in cwd
#   ./setup-voice.sh path/to/.env
#
# The .env must set FLOOT_TTS_MODEL to the absolute path of a piper .onnx voice.
set -euo pipefail

ENV_FILE="${1:-.env}"
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found. Copy .env.example to .env and fill in your values." >&2
  exit 1
fi

set -a; source "$ENV_FILE"; set +a

endo run --UNCONFINED voice-setup.js --powers @agent \
  -E STT_PETNAME="${STT_PETNAME:-floot-stt}" \
  -E TTS_PETNAME="${TTS_PETNAME:-floot-tts}" \
  -E FLOOT_TTS_BINARY="${FLOOT_TTS_BINARY:-piper}" \
  -E FLOOT_TTS_MODEL="${FLOOT_TTS_MODEL:-}" \
  -E FLOOT_TTS_SPEED="${FLOOT_TTS_SPEED:-1.0}" \
  -E FLOOT_STT_LANG="${FLOOT_STT_LANG:-en}"
