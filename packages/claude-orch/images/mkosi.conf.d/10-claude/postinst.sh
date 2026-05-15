#!/bin/sh
# Run inside the rootfs chroot during mkosi build. See DESIGN.md §8.1.
set -eu

# Create the unprivileged claude user. uid/gid 1000 to match bootstrap-init.
addgroup -g 1000 claude || true
adduser -D -u 1000 -G claude -h /home/claude -s /bin/bash claude || true

# Pin the Claude Code version we ship.
# The version is parameterized at build time via $CLAUDE_CODE_VERSION
# so the build script can override without editing this file.
: "${CLAUDE_CODE_VERSION:=latest}"
npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}"

# Make sure the agent binary will be on $PATH for the bootstrap exec().
mkdir -p /usr/local/bin
chmod 0755 /usr/local/bin

# Static resolv.conf — bootstrap-init does not run a resolver. The actual
# nameservers are written by build-image.sh after install via ExtraTrees.
true
