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
  orchestrator-client.js        # HTTP-over-UDS client (real)
  fs-bridge-9p.js               # 9P UDS bridge (real)
  9p/
    wire.js                     # message framing + LE primitives
    types.js                    # T, QT, errno, mode constants
    server.js                   # per-connection 9P2000.L state machine
test/
  9p-wire.test.js
  orchestrator-client.test.js
```

## Status

The Endo-side surface is implemented; what remains is end-to-end
validation against a live `@endo/claude-orch` running on a Linux host
with KVM, QEMU, and the kernel + rootfs images produced by
`packages/claude-orch/scripts/build-image.sh`.

9P operations implemented:
- Read path (mount + traverse + read): `Tversion`, `Tattach`, `Twalk`,
  `Tlopen`, `Tread`, `Tclunk`, `Tgetattr`, `Treaddir`, `Tstatfs`,
  `Tflush`.
- Write path (best-effort against the FS capability): `Tlcreate`,
  `Twrite`, `Tmkdir`, `Tunlinkat`, `Trenameat`.
- Unsupported operations return `Rlerror(ENOSYS)` so the guest VFS
  surfaces a clean errno.

See `ENDO-INTEGRATION.md` §9 for the prioritized roadmap.
