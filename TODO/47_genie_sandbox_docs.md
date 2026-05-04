# Genie: document the sandboxed workspace runtime

Sub-task of [`40_genie_sandbox.md`](./40_genie_sandbox.md).

Once the workspace-slice integration is wired up, the operator-facing
docs need to catch up so the slice is not invisible.

## Deliverables

- [ ] **`packages/genie/README.md`** — add a "Sandboxed workspace"
  section covering:
  - the bwrap / podman install prerequisites (cross-link to
    [`packages/sandbox/README.md`](../packages/sandbox/README.md)),
  - the new `GENIE_BACKEND` / `GENIE_NETWORK` env vars (or form
    fields) and their defaults,
  - the visible difference between `dev-repl` (host) and the daemon-
    hosted genie (slice),
  - what to expect from the network profile (`'private'` blocks
    RFC 1918 / host loopback; explicit opt-in for `host-*`).

- [ ] **`packages/genie/DESIGN.md`** — add an Architecture sub-section
  for the slice integration:
  - which capabilities the genie guest receives
    (`workspace`, `sandboxes`),
  - the spawner power that swaps `child_process.spawn` for
    `slice.spawn`,
  - lifecycle: slice is GC-pinned by `main-genie`, torn down on
    cancellation,
  - file / memory / web tools continue to run daemon-side; only
    `bash` / `exec` / `git` execute inside the slice.

- [ ] **`packages/genie/CLAUDE.md`** — once it exists (or as part of
  this task), capture the conventions a future contributor needs to
  know:
  - never call `child_process.spawn` directly from a tool — go
    through the spawner abstraction,
  - tools that need host fs access remain on the daemon side and use
    the `Mount` cap, not raw paths,
  - `GENIE_WORKSPACE` is a host path; the slice-internal cwd is
    `/workspace`,
  - testing protocol when a contributor changes the slice wiring.

- [ ] **Operator quickstart** for running a sandboxed genie on a
  fresh Linux host:
  ```sh
  sudo apt install bubblewrap            # one-time
  npx corepack yarn install              # repo bootstrap
  endo start
  GENIE_MODEL=ollama/llama3.2 \
    GENIE_WORKSPACE=$HOME/genie-ws \
    yarn --cwd packages/genie setup
  endo send main-genie 'hello'
  ```
  Include the `bubblewrap` install line and a one-line check that
  `bwrap --version` succeeds before kicking off `setup`.

- [ ] **Failure-mode cookbook.**
  Document the operator-side fix for each likely error:
  - "no backend available" → install `bwrap`,
  - "Creating new namespace failed" → enable
    `kernel.unprivileged_userns_clone`,
  - "mount cap not resolvable" → confirm the daemon ships
    `provideHostPath` (cross-link to
    [`41_genie_sandbox_provide_host_path.md`](./41_genie_sandbox_provide_host_path.md)),
  - "egress filter blocked X" → opt into a less-confined network
    profile, never silently widen.

## Status notes

- This task lands together with the test coverage in
  [`45_genie_sandbox_integration_test.md`](./45_genie_sandbox_integration_test.md):
  the README "Testing" section should reference the new scenario.
- Familiar / Electron renderer notes are out of scope — see
  [`PLAN/endo_posix_sandbox.md`](../PLAN/endo_posix_sandbox.md)
  § "Familiar follow-up notes" for the deferred surface.

## Cross-references

- [`packages/genie/README.md`](../packages/genie/README.md).
- [`packages/genie/DESIGN.md`](../packages/genie/DESIGN.md).
- [`packages/sandbox/README.md`](../packages/sandbox/README.md).
- [`PLAN/endo_posix_sandbox.md`](../PLAN/endo_posix_sandbox.md).
