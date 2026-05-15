# @endo/claude-orch

Host orchestrator for Claude Code microVM sandboxes.

This is the **host process** side of the design in
`packages/claude-container/DESIGN.md`.
It speaks HTTP/1.1 over a Unix domain socket to callers, spawns one
QEMU process per session, mediates the bootstrap handshake into the
guest, brokers credentials, and tears everything down on session end.

`@endo/claude-container` is the Endo capability side — it sits in
front of this orchestrator's UDS API.

## Status

**Milestone 1 — single-host Linux end-to-end** is in progress:

- [x] Repo skeleton, protocol types (`protocol.types.d.ts`).
- [x] Session manager (`src/sessions/session-manager.js`).
- [x] QEMU args builder + spawner (`src/qemu/`).
- [x] Network controllers — nftables on Linux, pf-anchor on macOS
  (`src/network/`).
- [x] Bootstrap RPC server, agent RPC server (`src/bootstrap/`, `src/agent/`).
- [x] HTTP/UDS API server (`src/api/server.js`).
- [x] Credential broker daemon and client (`src/broker/`, `src/broker-client/`).
- [x] `bin/claude-orch`, `bin/claude-broker`.
- [x] Guest image build pipeline: mkosi rootfs config, kernel
  fragment, `scripts/build-image.sh` driving cargo + mkosi + kbuild.
  Running it end-to-end needs a Linux host with `mkosi`, a kernel
  source tree at `$LINUX_SRC`, and the musl rustup targets.
- [x] Rust guest binaries: `rust/claude-orch/bootstrap-init` (PID 1,
  bootstrap handshake, 9P mount, drop privs, exec); and
  `rust/claude-orch/runtime-agent` (control RPC, tmux+claude spawn).
- [x] 9P bridge in `@endo/claude-container` (real bodies).
- [x] Tests: session manager, QEMU args builder, bootstrap RPC
  handshake, 9P wire framing, orchestrator HTTP client.
- [ ] End-to-end smoke test (gated on a Linux host with KVM + a built
  rootfs/kernel pair).

## Running locally (when complete)

```sh
# one shell
CLAUDE_ORCH_SOCKET=/tmp/claude/api.sock \
CLAUDE_ORCH_SESSION_DIR=/tmp/claude/sessions \
CLAUDE_ORCH_BROKER_SOCKET=/tmp/claude/broker.sock \
ANTHROPIC_API_KEY=sk-... \
  node bin/claude-broker

# another shell
CLAUDE_ORCH_SOCKET=/tmp/claude/api.sock \
CLAUDE_ORCH_SESSION_DIR=/tmp/claude/sessions \
CLAUDE_ORCH_BROKER_SOCKET=/tmp/claude/broker.sock \
CLAUDE_ORCH_IMAGE_DIR=$PWD/images/build \
  node bin/claude-orch
```

## Layout

```
packages/claude-orch/
├── README.md
├── package.json
├── protocol.types.d.ts                # protocol types (DESIGN.md §6)
├── bin/
│   ├── claude-orch           # API server entrypoint
│   └── claude-broker         # credential broker daemon
├── src/
│   ├── main.js               # wiring, lifecycle
│   ├── api/server.js         # HTTP/1.1 over UDS
│   ├── sessions/             # in-memory session table, boot nonce
│   ├── qemu/                 # args + child_process spawner
│   ├── network/              # platform-specific (nftables / pf)
│   ├── bootstrap/            # Hello/BootConfig over ctl chardev
│   ├── agent/                # runtime agent JSON-RPC link
│   ├── broker/               # credential broker daemon
│   └── broker-client/        # used by main.js
├── images/                   # mkosi + kernel configs
└── test/

rust/claude-orch/
├── bootstrap-init/           # PID 1 in the guest
└── runtime-agent/            # spawns claude-code in tmux
```

## Configuration

All knobs are environment variables — no config file:

| Variable | Default | Meaning |
|---|---|---|
| `CLAUDE_ORCH_SOCKET` | `/run/claude-orch/api.sock` | API socket path. |
| `CLAUDE_ORCH_SESSION_DIR` | `/run/claude-orch/sessions` | Per-session UDS dir. |
| `CLAUDE_ORCH_BROKER_SOCKET` | `/run/claude-orch/broker.sock` | Broker UDS. |
| `CLAUDE_ORCH_IMAGE_DIR` | `/opt/claude-orch/share/images` | Kernel + rootfs. |
| `CLAUDE_ORCH_DEFAULT_VCPUS` | `2` | Default per-session vCPUs. |
| `CLAUDE_ORCH_DEFAULT_MEM_MB` | `2048` | Default per-session RAM (MB). |
| `CLAUDE_ORCH_BOOT_DEADLINE_MS` | `30000` | Hello deadline. |
| `CLAUDE_ORCH_HEARTBEAT_TIMEOUT_MS` | `60000` | Agent unhealthy threshold. |
| `CLAUDE_ORCH_BROKER_CONFIG` | _none_ | Path to a 0600 file containing the API key, alternative to `ANTHROPIC_API_KEY`. |
| `ANTHROPIC_API_KEY` | _none_ | Used by the broker if `CLAUDE_ORCH_BROKER_CONFIG` is unset. |
