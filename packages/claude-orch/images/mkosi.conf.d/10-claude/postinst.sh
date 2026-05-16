#!/bin/sh
# Run inside the rootfs chroot during mkosi build. See DESIGN.md §8.1.
set -eu

# Create the unprivileged claude user. uid/gid 1000 to match bootstrap-init.
addgroup -g 1000 claude || true
adduser -D -u 1000 -G claude -h /home/claude -s /bin/bash claude || true

# Pin the Claude Code version we ship.
#
# The runtime-agent invokes `claude --print --input-format stream-json
# --output-format stream-json`, so pin to a version whose CLI surface
# matches that contract. Default is the latest in the major series we
# track; build-image.sh's $CLAUDE_CODE_VERSION env overrides without
# editing this file.
: "${CLAUDE_CODE_VERSION:=^2}"
npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}"
# Verify the CLI is on PATH and answers --version (smoke check inside
# the rootfs build). If this fails the image is unusable; fail the
# build instead of shipping a broken rootfs.
claude --version >/dev/null 2>&1 || {
  echo "claude binary not on PATH after install (CLAUDE_CODE_VERSION=$CLAUDE_CODE_VERSION)" >&2
  exit 1
}

# Make sure the agent binary will be on $PATH for the bootstrap exec().
mkdir -p /usr/local/bin
chmod 0755 /usr/local/bin

# Static resolv.conf — bootstrap-init does not run a resolver. The actual
# nameservers are written by build-image.sh after install via ExtraTrees.
true
