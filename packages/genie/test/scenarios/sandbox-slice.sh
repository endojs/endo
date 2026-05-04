#!/usr/bin/env bash
# Scenario: sandbox-slice
#
# Verifies that the genie agent's `bash` tool runs inside a confined
# bwrap slice rather than directly on the host.  The probes are
# deliberately small and produce stable substrings so the LLM-driven
# response can be matched with `assert_reply_contains` without depending
# on the model's verbosity.
#
# Sub-task of TODO/45_genie_sandbox_integration_test.md.
#
# This script is sourced by `integration.sh` and has access to:
#   endo, wait_for, trace_reply, wait_for_reply, send_and_wait,
#   assert_reply_contains, current_max_msg,
#   ENDO_BIN, TEST_DIR, GENIE_WORKSPACE, GENIE_NAME
#
# Skip rules:
#   * `bwrap --version` must succeed; otherwise we `exit 0` cleanly so
#     CI runners without bubblewrap installed do not spuriously fail.
#     This mirrors the skip pattern in
#     packages/sandbox/test/bwrap.test.js.
#   * The optional curl probe is skipped when `curl` is not available
#     inside the slice's rootfs.

set -euo pipefail

# ---------------------------------------------------------------------------
# Skip-on-no-bwrap
# ---------------------------------------------------------------------------

if ! bwrap --version >/dev/null 2>&1; then
  echo "[sandbox-slice] SKIP: bwrap not available on this host."
  echo "[sandbox-slice] Install with: sudo apt install bubblewrap"
  exit 0
fi

# A rootless user-namespace smoke test catches kernels that have bwrap
# installed but block unprivileged userns creation (AppArmor or
# kernel.unprivileged_userns_clone=0).  The integration test harness'
# Phase 3 already dumps worker logs when the agent never announces
# "ready", so we only need a quick pre-flight here so the skip reason
# is loud rather than letting the agent timeout silently below.
if ! bwrap --unshare-all --die-with-parent \
        --ro-bind-try /usr /usr --ro-bind-try /lib /lib \
        --ro-bind-try /lib64 /lib64 --ro-bind-try /bin /bin \
        --proc /proc --dev /dev --clearenv -- /bin/true >/dev/null 2>&1; then
  echo "[sandbox-slice] SKIP: bwrap user-namespace smoke test failed."
  echo "[sandbox-slice] Likely causes:"
  echo "[sandbox-slice]   * sysctl kernel.unprivileged_userns_clone=0"
  echo "[sandbox-slice]   * AppArmor 'userns' rule denies unprivileged callers"
  echo "[sandbox-slice]   * nested inside a container that blocks userns"
  exit 0
fi

# ---------------------------------------------------------------------------
# Probe A — workspace-bind: round-trip a host-written sentinel through
# the slice-side `bash cat /workspace/<file>` to prove both views see
# the same bytes.
# ---------------------------------------------------------------------------

echo "[sandbox-slice] Probe A: workspace bind round-trip"

# Distinctive marker the LLM has no plausible reason to emit on its own.
SENTINEL_MARK="SLICE_BIND_OK_$(date +%s)_PURPLE_OTTER_42"
echo "$SENTINEL_MARK" > "$GENIE_WORKSPACE/sandbox-slice-probe-a.txt"

send_and_wait \
  "Please run the bash command \`cat /workspace/sandbox-slice-probe-a.txt\` and reply with the exact bytes you read, with no commentary." \
  180

assert_reply_contains "$SENTINEL_MARK"
echo "[sandbox-slice] ✓ Probe A passed: slice and host see the same workspace bytes."

# ---------------------------------------------------------------------------
# Probe B — mount: ask the agent to relay `mount` output and confirm
# the workspace bind is the only host-mapped surface.  The slice's
# /workspace must appear; the operator's $HOME must not.
# ---------------------------------------------------------------------------

echo "[sandbox-slice] Probe B: mount listing"

# A second sentinel forces the LLM to emit a stable terminator regardless
# of its formatting choices, so `assert_reply_contains` has something
# distinctive to match.  Using a per-probe salt keeps the inbox dump
# from cross-contaminating earlier matches.
MOUNT_MARK="MOUNT_PROBE_DONE_$(date +%s)_GREEN_BADGER"

send_and_wait \
  "Please run the bash command \`mount\`, then reply with the full output verbatim followed by a final line containing exactly the marker '$MOUNT_MARK' (no quotes)." \
  180

assert_reply_contains "$MOUNT_MARK"
assert_reply_contains "/workspace"
echo "[sandbox-slice] ✓ Probe B passed: /workspace bind visible in slice mount table."

# ---------------------------------------------------------------------------
# Probe C — host filesystem isolation: a file that exists on the host
# under a path NOT bound into the slice (we use $TEST_DIR which lives
# under the daemon's tmpdir) must be invisible from inside the slice.
# ---------------------------------------------------------------------------

echo "[sandbox-slice] Probe C: host filesystem isolation"

ISOLATION_MARK="HOST_PRIVATE_$(date +%s)_BLUE_HERON_77"
HOST_PRIVATE_PATH="$TEST_DIR/host-private-sentinel.txt"
echo "$ISOLATION_MARK" > "$HOST_PRIVATE_PATH"

# Ask the agent to attempt a read from inside the slice.  The slice's
# host-bind rootfs only exposes /usr, /lib, /etc, etc.; $TEST_DIR is
# host-only, so `cat` should fail with "No such file" or a permission
# error.  A leak (the marker appearing in the reply) would prove the
# slice is not isolating the host filesystem.
ISOLATION_DONE="ISOLATION_PROBE_DONE_$(date +%s)_RED_FOX_99"
send_and_wait \
  "Please run the bash command \`cat ${HOST_PRIVATE_PATH} 2>&1\` and reply with the exact output (whether success or error) followed by a final line containing exactly '$ISOLATION_DONE'." \
  180

assert_reply_contains "$ISOLATION_DONE"
inbox_dump="$(endo inbox 2>/dev/null || true)"
if echo "$inbox_dump" | grep -q "$ISOLATION_MARK"; then
  echo "[sandbox-slice] ✗ FAIL: host-private sentinel leaked into the slice." >&2
  echo "[sandbox-slice] Inbox dump:" >&2
  echo "$inbox_dump" >&2
  exit 1
fi
echo "[sandbox-slice] ✓ Probe C passed: host-only path is invisible inside the slice."

# ---------------------------------------------------------------------------
# Probe D — network profile: when the slice runs under the default
# `private` network profile, host loopback (127.0.0.1) routes to the
# slice's own loopback, not the host's, so any TCP connect to a host-
# only port fails fast.  Skip when curl is absent from the rootfs (the
# minimal `host-bind` rootfs may not include it).
# ---------------------------------------------------------------------------

echo "[sandbox-slice] Probe D: network profile (loopback unreachable)"

# Detect curl by asking the slice to run `command -v curl`.  We use a
# probe-and-check round so we can `exit 0` when curl is missing without
# leaving the rest of the scenario in an undefined state.
CURL_PROBE_MARK="CURL_AVAIL_$(date +%s)_YELLOW_FERRET"
send_and_wait \
  "Please run \`command -v curl >/dev/null 2>&1 && echo HAVE_CURL || echo NO_CURL\` via bash and reply with just the single word HAVE_CURL or NO_CURL followed by '$CURL_PROBE_MARK'." \
  120

inbox_dump="$(endo inbox 2>/dev/null || true)"
if ! echo "$inbox_dump" | grep -q "$CURL_PROBE_MARK"; then
  echo "[sandbox-slice] WARN: could not determine curl availability; skipping probe D." >&2
elif echo "$inbox_dump" | grep -q "NO_CURL"; then
  echo "[sandbox-slice] SKIP probe D: curl is not available inside the slice rootfs."
else
  CURL_FAIL_MARK="CURL_PROBE_DONE_$(date +%s)_ORANGE_OWL"
  send_and_wait \
    "Please run \`curl -sS --max-time 5 http://127.0.0.1:8920/ 2>&1; echo EXIT=\$?\` via bash and reply with the exact output followed by '$CURL_FAIL_MARK'." \
    180

  assert_reply_contains "$CURL_FAIL_MARK"
  # Accept any of the canonical "couldn't reach" failure phrasings
  # curl emits across versions / locales.
  inbox_dump="$(endo inbox 2>/dev/null || true)"
  if echo "$inbox_dump" \
     | grep -Eqi 'Failed to connect|Connection refused|Could.?n.?t connect|EXIT=[1-9]'; then
    echo "[sandbox-slice] ✓ Probe D passed: loopback unreachable from slice's private netns."
  else
    echo "[sandbox-slice] ✗ FAIL: curl to host loopback did not fail — slice may share the host netns." >&2
    echo "[sandbox-slice] Inbox dump:" >&2
    echo "$inbox_dump" >&2
    exit 1
  fi
fi

echo "[sandbox-slice] ✓ All probes passed (or skipped cleanly)."
