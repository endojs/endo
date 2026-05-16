# @endo/claude-container

Expose Claude Code microVM sandboxes as Endo capabilities.

This package is the **Endo capability side**: a factory caplet on
`@host`, a form whose `filesystem` field names an Endo FS capability
to project into a new microVM, and a `ClaudeClient` exo that wraps the
`claude -p --output-format stream-json` I/O contract.

The **host process side** — QEMU, networking, bootstrap/agent RPC,
credential broker — lives in `@endo/claude-orch` as a sibling package.

## Documents

- `DESIGN.md` — end-to-end plan for the host orchestrator.
- `ENDO-INTEGRATION.md` — how the sandbox is presented as an Endo
  capability. §9 carries the roadmap, notably **R1 — remote-friendly
  Filesystem capability**, called out as future work because v1's 9P
  bridge round-trips every operation against the FS capability and is
  chatty for remote FS sources.

## Quick start

With the orchestrator (`@endo/claude-orch`) running on the host:

```sh
./scripts/create-factory.sh
```

That registers `claude-container-factory` on `@host` and surfaces a
"Create Claude Container" form in the host's inbox.
Each form submission spins up a microVM, projects the named filesystem
capability into `/workspace`, starts Claude Code inside, and stores a
`ClaudeClient` exo back in `@host`'s petstore under the name you
chose.

```js
const claude = await E(host).lookup('claude-1');
const reader = await E(claude).send('Tell me a story.');
for await (const event of makeRefIterator(reader)) {
  console.log(event);
}
```

## Layout

```
DESIGN.md                       # microVM sandbox design
ENDO-INTEGRATION.md             # endo capability surface + roadmap
scripts/
  create-factory.sh             # one-shot factory provisioner
setup.js                        # ran by create-factory.sh
src/
  claude-container-factory.js   # factory caplet (form loop)
  claude-client.js              # ClaudeClient exo + Far iterator wrap
  orchestrator-client.js        # HTTP-over-UDS client
  fs-bridge-9p.js               # 9P UDS bridge
  9p/
    wire.js                     # message framing + LE primitives
    types.js                    # T, QT, errno, mode constants
    server.js                   # per-connection 9P2000.L state machine
test/
  9p-wire.test.js               # framing round-trips
  orchestrator-client.test.js   # HTTP-over-UDS + sendPrompt contract
  factory.test.js               # form-loop + replay guard
```

## Status

The Endo-side surface is implemented and the host stack is validated
end-to-end on real KVM. The full Hello → BootConfig → 9P mount → drop
privs → exec claude-agent → Ready chain runs cleanly through
`@endo/claude-orch/scripts/smoke-boot.sh`. The remaining work is
hooking this package's factory caplet to the real
`@endo/claude-orch` daemon in a live Endo environment and exercising
form-driven session creation.

9P operations implemented:
- Read path (mount + traverse + read): `Tversion`, `Tattach`, `Twalk`,
  `Tlopen`, `Tread`, `Tclunk`, `Tgetattr`, `Treaddir`, `Tstatfs`,
  `Tflush`.
- Write path (best-effort against the FS capability): `Tlcreate`,
  `Twrite`, `Tmkdir`, `Tunlinkat`, `Trenameat`. Errors map to
  `Rlerror(ENOSYS)` when the FS capability lacks a verb,
  `Rlerror(EACCES)` for permission failures, `Rlerror(EIO)` for
  genuine I/O failures.
- `Tsetattr` returns `Rlerror(EOPNOTSUPP)` rather than a silent no-op.
- Other ops return `Rlerror(ENOSYS)` so the guest VFS surfaces a
  clean errno.

Tests: 11 ava cases — all green.

See `ENDO-INTEGRATION.md` §9 for the prioritized roadmap.
