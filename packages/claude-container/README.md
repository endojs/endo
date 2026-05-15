# @endo/claude-container

Expose Claude Code microVM sandboxes as Endo capabilities.

This package is currently **design + scaffolding** — the runnable
pieces are the design documents and a shell script that provisions
the factory caplet on `@host`.
The orchestrator binary and the 9P bridge bodies are tracked in the
implementation milestones inside `DESIGN.md` and `ENDO-INTEGRATION.md`.

## Documents

- `DESIGN.md` — end-to-end plan for the microVM sandbox orchestrator
  (the host process that runs QEMU, mediates the bootstrap handshake,
  and brokers credentials).
- `ENDO-INTEGRATION.md` — how the sandbox is presented as an Endo
  capability: a factory on `@host`, a form whose `filesystem` field
  names an Endo FS capability to project into the guest, and a
  `ClaudeClient` exo wrapping `claude -p` streaming JSON I/O.
  Includes the roadmap (§9), notably the remote-friendly filesystem
  surface left as future work.

## Quick start

Once the orchestrator described in `DESIGN.md` is running on the
host (`/run/claude-orch/api.sock`):

```sh
./scripts/create-factory.sh
```

That registers `claude-container-factory` on `@host` and surfaces a
"Create Claude Container" form in the host's inbox.
Each form submission spins up a microVM, projects the named filesystem
capability into `/workspace`, starts Claude Code inside, and stores a
`ClaudeClient` exo back in `@host`'s petstore under the name you
chose.

## Layout

```
DESIGN.md                       # microVM sandbox design (committed first)
ENDO-INTEGRATION.md             # endo capability surface + roadmap
scripts/
  create-factory.sh             # one-shot factory provisioner
setup.js                        # ran by create-factory.sh
src/
  claude-container-factory.js   # factory caplet (form loop)
  claude-client.js              # ClaudeClient exo
  orchestrator-client.js        # HTTP-over-UDS client (stub)
  fs-bridge-9p.js               # 9P server backed by an Endo FS cap (stub)
```

## Status

Skeleton; not yet runnable end-to-end.
The orchestrator described in `DESIGN.md` is also unimplemented.
See `ENDO-INTEGRATION.md` §9 for the prioritized roadmap.
