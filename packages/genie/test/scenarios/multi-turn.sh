#!/usr/bin/env bash
# Scenario: multi-turn conversation
#
# Verifies that the genie can retain context across multiple messages
# within a single session.
#
# This script is sourced by integration.sh and has access to:
#   endo, wait_for, wait_for_reply, send_and_wait,
#   assert_reply_contains, current_max_msg,
#   CURRENT_MAX, GENIE_WORKSPACE

set -euo pipefail

echo "[multi-turn] Round 1: Ask genie to remember a number"
send_and_wait "Remember the number 42"

echo "[multi-turn] Round 2: Ask genie to recall the number"
send_and_wait "What number did I ask you to remember?"

assert_reply_contains "42"

echo "[multi-turn] ✓ Multi-turn scenario passed."
