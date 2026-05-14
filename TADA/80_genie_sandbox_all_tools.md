
- read the TODO in `packages/genie/src/tools/web-fetch.js` around line 50

- now that we run system command tools like "bash" and "exec" in a sandbox,
  other tools which run inside the host's system namespace are over-privileged
  by comparison

- currently we run a noop `sleep` process as pid 1 to hold sandboxes open
  - but I'm dreaming of that pid 1 process being the thing that holds all tool execution
  - there are many hurdles in our way to getting there tho, not least of all
    that the "ideal" thing would be to have some endo captp using code running
    "over there" — but that immediately runs into code distribution problems
    - we'd need to *at least* ro-mount the host's endo distribution into the
      sandbox, especially so for ease of development; this might work better
      with drivers like `bwrap` but becomes more awkward the more layers
      intervene between the host and the sandbox; e.g. podman today will be
      pretty easy, up and until we start using its `krun` micro-vm backend;
      drivers for macos and windows will be equally awkward, in terms of
      mapping the host's endo distribution thru all layers

- [x] analyze, design, and report back here
  - [x] draft a `PLAN/` document for this, do not start coding yet
    - see [`PLAN/genie_sandbox_all_tools.md`](../PLAN/genie_sandbox_all_tools.md)
    - phased plan: Phase A is host-side defense in depth (route
      `webFetch` / `webSearch` through the slice's `Spawner` so they
      inherit the slice's network namespace; make `workspaceMount`
      mandatory for daemon-side file tools when a slice is bound;
      document the FTS5 deferral)
    - Phase B replaces `sleep infinity` pid-1 with an in-slice Endo
      agent that mediates every tool call, under the `bwrap` driver
      with `host-bind` / `mount` / `minimal` rootfs (where ro-binding
      the daemon's `node_modules/@endo/...` and `process.execPath` is
      cheap)
    - Phase C extends the in-slice agent to `podman` (binds for
      `host-bind` / `mount` / `minimal`; sibling-layer OCI bake or
      libc-compat probe for `oci:<ref>`), to `podman+krun` (deferred
      until virtiofs-socket kernel matrix is confirmed), and to
      `lima` / `wsl2` (composes Phase B inside the guest)
    - Phase A.1 spawner-backed fallback shields the genie from all
      distribution awkwardness — Phase B and C are progressive
      improvements, not prerequisites

