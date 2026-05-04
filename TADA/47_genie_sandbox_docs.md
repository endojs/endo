# Genie: document the sandboxed workspace runtime

Sub-task of [`40_genie_sandbox.md`](./40_genie_sandbox.md).

Once the workspace-slice integration is wired up, the operator-facing
docs need to catch up so the slice is not invisible.

## Deliverables

- [x] **`packages/genie/README.md`** — add a "Sandboxed workspace"
  section covering:
  - the bwrap / podman install prerequisites (cross-link to
    [`packages/sandbox/README.md`](../packages/sandbox/README.md)),
  - the new `GENIE_BACKEND` / `GENIE_NETWORK` env vars (or form
    fields) and their defaults,
  - the visible difference between `dev-repl` (host) and the daemon-
    hosted genie (slice),
  - what to expect from the network profile (`'private'` blocks
    RFC 1918 / host loopback; explicit opt-in for `host-*`).

  Done.  The README's "Sandboxed workspace" section covers all four
  bullets.  Note: `backend` / `network` are configuration-form fields
  rather than env vars; `setup.js` does not currently read
  `GENIE_BACKEND` / `GENIE_NETWORK` from the environment, so the
  README documents the form path explicitly.  Promoting them to env
  vars is a follow-up — wiring `setup.js` to forward them into the
  initial form submission would land in the same patch as a future
  `setup.js` refactor.

- [x] **`packages/genie/DESIGN.md`** — add an Architecture sub-section
  for the slice integration:
  - which capabilities the genie guest receives
    (`workspace`, `sandboxes`),
  - the spawner power that swaps `child_process.spawn` for
    `slice.spawn`,
  - lifecycle: slice is GC-pinned by `main-genie`, torn down on
    cancellation,
  - file / memory / web tools continue to run daemon-side; only
    `bash` / `exec` / `git` execute inside the slice.

  Done.  See `DESIGN.md` § "Sandbox slice integration
  (`main.js` + `tools/sandbox-spawner.js`)".

- [x] **`packages/genie/CLAUDE.md`** — once it exists (or as part of
  this task), capture the conventions a future contributor needs to
  know:
  - never call `child_process.spawn` directly from a tool — go
    through the spawner abstraction,
  - tools that need host fs access remain on the daemon side and use
    the `Mount` cap, not raw paths,
  - `GENIE_WORKSPACE` is a host path; the slice-internal cwd is
    `/workspace`,
  - testing protocol when a contributor changes the slice wiring.

  Done.  `packages/genie/CLAUDE.md` was created with all four
  sections plus a "When you add a new sandbox backend" checklist and
  a cross-package coupling matrix for slice-wiring changes.

- [x] **Operator quickstart** for running a sandboxed genie on a
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

  Done.  See README § "Operator quickstart"; `bwrap --version`
  appears as the verification step right after the install line.

- [x] **Failure-mode cookbook.**
  Document the operator-side fix for each likely error:
  - "no backend available" → install `bwrap`,
  - "Creating new namespace failed" → enable
    `kernel.unprivileged_userns_clone`,
  - "mount cap not resolvable" → confirm the daemon ships
    `provideHostPath` (cross-link to
    [`41_genie_sandbox_provide_host_path.md`](./41_genie_sandbox_provide_host_path.md)),
  - "egress filter blocked X" → opt into a less-confined network
    profile, never silently widen.

  Done.  See README § "Failure-mode cookbook"; each row maps a
  literal error string to its operator-side fix, plus a row covering
  the silent-fallback `agent ready (… backend: (host))` symptom.

## Status notes

- This task lands together with the test coverage in
  [`45_genie_sandbox_integration_test.md`](./45_genie_sandbox_integration_test.md):
  the README "Testing" section should reference the new scenario.
  Done — the README's "Testing → Integration tests" subsection
  documents `yarn test:integration:sandbox-slice` and the
  bubblewrap / kernel prerequisites.
- Familiar / Electron renderer notes are out of scope — see
  [`PLAN/endo_posix_sandbox.md`](../PLAN/endo_posix_sandbox.md)
  § "Familiar follow-up notes" for the deferred surface.

## Follow-ups (not blocking this task)

- `setup.js` could grow `GENIE_BACKEND` / `GENIE_NETWORK` env-var
  support so operators can override slice defaults without answering
  the configuration form by hand.  The README currently documents
  the form-only path; flip the docs back to the env-var phrasing
  when the code lands.
- Once `@endo/sandbox` lands the in-slice Landlock ruleset and
  cgroup writes (deferred items in
  [`packages/sandbox/README.md`](../packages/sandbox/README.md)
  § "Phase 1.5 status notes"), add a "Hardening layers visible to
  the agent" subsection to the genie README so operators know which
  controllers are active per slice.

## Cross-references

- [`packages/genie/README.md`](../packages/genie/README.md).
- [`packages/genie/DESIGN.md`](../packages/genie/DESIGN.md).
- [`packages/sandbox/README.md`](../packages/sandbox/README.md).
- [`PLAN/endo_posix_sandbox.md`](../PLAN/endo_posix_sandbox.md).
