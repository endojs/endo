# Wire the slice into `dev-repl.js`

**Status: landed.**  `dev-repl.js` now mints a slice through
`makeLocalSandboxPowers` + `mintGenieSlice`, gated behind the
`--sandbox` / `--network` / `--rootfs` CLI flags.  Workspace seeding
flows through the workspace `Mount` cap (`initWorkspaceMount`) so the
dev-repl rides the same cap surface as the daemon (TADA/23).  Slice
teardown is still TODO/54; a slice-aware integration test is TODO/55;
docs are TODO/56.

Turn on slice-backed `bash` / `exec` / `git` execution in the
dev-repl, gated behind a `--sandbox` CLI flag that defaults to
`auto`.  Depends on TODO/51 (local powers) and TODO/52 (slice
helper).

## Scope

### CLI surface

Add three flags to the `getFlag` / `hasFlag` parsing in `runMain`:

| Flag                     | Values                                                                  | Default     |
| ------------------------ | ----------------------------------------------------------------------- | ----------- |
| `--sandbox <selector>`   | `auto` \| `bwrap` \| `podman` \| `off`                                  | `auto`      |
| `--network <profile>`    | `none` \| `private` \| `host-loopback` \| `host-lan` \| `host-net`      | `private`   |
| `--rootfs <kind>`        | `host-bind` \| `minimal` \| `oci:<ref>`                                 | `host-bind` |

- `--sandbox off` skips slice minting entirely (legacy direct host
  spawn — current behaviour).  Useful on macOS / non-Linux where no
  driver is available.
- `--sandbox auto` probes drivers; falls back to host spawn with a
  one-line warning when none is available, so the dev-repl still
  works on contributor laptops that lack `bwrap`.
- `--sandbox bwrap` / `--sandbox podman` is a hard request — the
  REPL exits with a structured error if the driver is unavailable
  (mirrors the daemon's "explicit confinement, no implicit
  relaxation" rule).
- Reuse `parseRootfsValue` / `assertRootfsBackendCompatible` from
  `packages/genie/src/sandbox/slice.js` (per TODO/52).
- Reject typos at the CLI boundary against the same allow-lists
  `main.js` uses; structured-error messages should mention the dev-repl
  context (`"dev-repl: unknown sandbox backend …"`).

### Wiring

Implemented in `runMain` after `workspaceDir` is resolved and before
`buildGenieTools` is called.  The driver-list import question
resolved to **route through `@endo/sandbox`'s default `make` export**
— it already constructs the factory with bwrap + podman registered
and accepts a `SandboxPowers`, so the dev-repl reuses the same agent-
boot path as `setup.js` instead of poking at private driver modules.
A future driver gets picked up automatically without needing a
matching dev-repl change.

1. `import { make as makeSandboxFactoryFromPowers } from
   '@endo/sandbox'` — single import covers driver registration +
   factory minting.
2. `import { makeLocalSandboxPowers } from
   './src/sandbox/local-powers.js'` (TODO/51).
3. `import { mintGenieSlice } from './src/sandbox/slice.js'`
   (TODO/52).
4. Build the local powers and a workspace Mount cap rooted at
   `workspaceDir`:
   ```js
   const { powers: sandboxPowers, makeMountCapForPath } =
     makeLocalSandboxPowers();
   const workspaceMount = makeMountCapForPath(workspaceDir);
   ```
   `dispose` is intentionally not destructured yet — TODO/54 wires
   REPL-exit teardown.
5. Switch the seed-copy from `initWorkspace(workspaceDir)` to
   `initWorkspaceMount(workspaceMount)` so the dev-repl rides the
   same cap surface the daemon uses (mirrors TADA/23).
6. When `--sandbox off`, skip the slice path entirely.  Otherwise
   build the factory via `makeSandboxFactoryFromPowers(sandboxPowers)`.
7. Mint the slice via `mintGenieSlice({ sandboxFactory, agentName:
   'dev-repl', workspaceMount, workspaceDir, backend, network,
   rootfs, rootfsLabel, env: {}, onLog, onWarn })`.  When
   `--sandbox auto`, pre-probe `listBackends()` so we can warn + fall
   through to host spawn when no driver is available; a hard request
   (`--sandbox bwrap` / `--sandbox podman`) lets `mintGenieSlice`
   throw the structured error.
8. The slice's spawner comes back as `minted.spawner`; no separate
   `makeSandboxSpawner` call is needed at the dev-repl boundary
   (`mintGenieSlice` already wraps the handle internally).
9. Pass `spawner` (when set) and `workspaceMount` into the existing
   `buildGenieTools({ workspaceDir, searchBackend, include, …,
   spawner, workspaceMount })` call.

Mount-cap type aliases live in different packages
(`@endo/sandbox/types.js` `MountCap` vs `WorkspaceMountCap` /
`MountVFSCap`) and don't structurally overlap from the checker's
view.  The dev-repl mirrors `main.js`'s `buildTools` cast at the two
boundary call sites (`initWorkspaceMount` and `buildGenieTools`).

### Status banner

Extend the `describe()` generator so the banner shows the slice's
state:

```
Sandbox:   bwrap (network: private, rootfs: host-bind)
```

(or `Sandbox: off` when `--sandbox off` / no backend available).
Mirrors the daemon's `agent ready` log line.

### `--quiet-background` and other interactions

The slice / `Spawner` swap is orthogonal to the existing
observer / reflector / background-printer wiring; no changes
expected there.

## Acceptance

- `node packages/genie/dev-repl.js --workspace /tmp/foo --sandbox bwrap -c "bash 'cat /proc/self/status | grep ^Name'"`
  prints a process running inside the slice (no leakage of the host
  process tree).  ✅ Banner reads `Sandbox: bwrap (network: private,
  rootfs: host-bind)` and `mintGenieSlice` writes a "Sandbox slice
  minted" line to stderr; tools route through the slice spawner.
- `--sandbox off` keeps the dev-repl working on macOS without
  bubblewrap.  ✅ Banner reads `Sandbox: off`; no factory or slice
  mint happens.
- `--sandbox bogus` exits with `dev-repl: unknown sandbox backend
  "bogus"; expected "off" or one of "auto, bwrap, podman, lima,
  containerization, wsl"`.  ✅
- The same CLI args produce the same banner string in interactive
  mode and the same model output in `-c` mode.  ✅
- All the existing `--no-tools` / `--quiet-background` / `-s` flag
  combinations continue to work.  ✅ (smoke-tested with `--no-tools`
  + `--sandbox off` and `--sandbox auto`.)
- `npx corepack yarn lint` + `npx tsc -p .` clean for the genie
  package after the change.  ✅
- `npx corepack yarn ava --timeout=90s` — 327 tests pass; no new
  failures introduced.  ✅

## Out of scope

- Slice teardown wiring — handled in TODO/54.
- The integration test — handled in TODO/55.
- Documentation updates — handled in TODO/56.

## Open question

Should `--sandbox` default to `off` (current behaviour) or `auto`
(default-on when bwrap is present)?  The proposal is **`auto`** so
that the dev-repl matches the daemon's confinement defaults out of
the box, with `--sandbox off` as the explicit opt-out.  Reviewers
should push back if the noise from the "no backend available"
warning on non-Linux contributor machines is too high.

**Resolved:** landed with the default set to `auto` (via
`DEFAULT_BACKEND` from `slice.js`).  The `--sandbox auto` no-backend
path falls through to host spawn with a single yellow warning line
that names the absent drivers' reasons; macOS / non-Linux
contributors can silence it with `--sandbox off` (no slice path is
even constructed in that mode).
