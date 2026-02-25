# Familiar Daemon Bundling

| | |
|---|---|
| **Date** | 2026-02-14 |
| **Author** | Kris Kowal (prompted) |
| **Status** | In Progress |

## What is the Problem Being Solved?

The Endo daemon currently runs from source via Node.js, with dependencies
resolved through the monorepo workspace (`packages/daemon` imports from
`@endo/captp`, `@endo/exo`, `@endo/marshal`, `ses`, etc.). This is fine for
development, but the Familiar Electron application needs to ship the daemon as
a self-contained artifact that can be spawned with a bundled Node.js executable
on the user's platform.

The daemon must be packaged such that:
1. It can run with a standalone Node.js binary (not the monorepo).
2. All `@endo/*` dependencies are bundled or co-located.
3. Worker processes can be spawned from the bundle.
4. Platform-specific native modules (if any) are handled.

## Description of the Design

### Bundle strategy

Use `@endo/bundle-source` (already in the monorepo) or a bundler like esbuild
to produce a single-file or single-directory artifact for the daemon.

#### Option A: Single-file bundle (preferred)

Produce a single `.cjs` file that contains the daemon and all its dependencies.
This is the simplest packaging strategy:

```bash
esbuild packages/daemon/src/daemon-node.js \
  --bundle --platform=node --target=node20 \
  --outfile=dist/endo-daemon.cjs
```

**Challenges:**
- The daemon uses dynamic `import()` for workers
  (`packages/daemon/src/worker.js`), weblets, and guest code. These cannot be
  statically bundled because they load user-provided code at runtime.
- The `ses` package modifies JavaScript globals at import time (`lockdown()`).
  Bundlers must preserve this side effect.
- The WASM module for OCapN-Noise
  (`packages/ocapn-noise/gen/ocapn-noise.wasm`) needs to be co-located.

**Mitigations:**
- Worker entry points and the SES shim can be bundled as separate artifacts
  alongside the main daemon bundle.
- The main bundle includes everything except dynamically loaded user code.
- WASM files are copied alongside the bundle.

#### Option B: Packaged directory

Copy the daemon package and its `node_modules` into a self-contained directory.
This avoids bundler complexity but produces a larger artifact.

### Worker process bundling

The daemon spawns worker processes via
`packages/daemon/src/daemon-node-powers.js` using `child_process.fork()` or
`popen.spawn()`. Each worker runs `packages/daemon/src/worker.js` as its entry
point.

The worker entry point must also be bundled (or at minimum, resolvable from the
daemon bundle's location). The daemon should resolve the worker entry point
relative to its own location:

```js
const workerPath = new URL('./endo-worker.cjs', import.meta.url).pathname;
```

### Node.js executable

Familiar ships a platform-specific Node.js binary:
- macOS: `node` for arm64 and/or x86_64
- Linux: `node` for x86_64, arm64
- Windows: `node.exe` for x86_64

The daemon is launched with this bundled Node.js:

```bash
<familiar-resources>/node <familiar-resources>/endo-daemon.cjs \
  <sock-path> <state-path> <ephemeral-state-path> <cache-path>
```

### Build artifacts

```
dist/
  endo-daemon.cjs       # Main daemon bundle
  endo-worker.cjs       # Worker entry point bundle
  ses-shim.cjs          # SES lockdown (if separate)
  ocapn-noise.wasm      # Noise Protocol WASM (if applicable)
  node-<platform>-<arch> # Platform-specific Node.js binary
```

### Build script

Add a build script to `packages/daemon` (or a new `packages/familiar-build`
package) that produces the bundle:

```json
{
  "scripts": {
    "bundle": "node scripts/bundle-daemon.js"
  }
}
```

### Affected packages

- `packages/daemon` — add bundle configuration, resolve paths relative to
  bundle location
- New build tooling (script or package) for producing the bundle

### Dependency

- None (can proceed independently of other Familiar work items).

## Security Considerations

- The bundled daemon runs with the same authority as the unbundled daemon. No
  change in security posture.
- The bundled Node.js binary must be from a trusted source (official Node.js
  releases). Consider verifying checksums during the build.
- The bundle should not include development-only code or test fixtures.

## Scaling Considerations

- Bundle size matters for Electron distribution. Target < 50MB for the daemon +
  Node.js combined (Node.js alone is ~40MB).
- Tree-shaking can reduce bundle size by eliminating unused code paths.

## Test Plan

- Smoke test: run the bundled daemon with the bundled Node.js, connect via CLI,
  verify basic operations (eval, store, list).
- Worker test: verify worker processes spawn correctly from the bundle.
- Cross-platform test: build and run on macOS, Linux (CI).

## Compatibility Considerations

- The bundled daemon must produce the same Unix socket protocol, CapTP messages,
  and persistence format as the unbundled daemon. It's the same code, just
  packaged differently.
- The bundled daemon should use the same state directory
  (`~/.local/state/endo/`) so it's interchangeable with the development daemon.

## Upgrade Considerations

- When Familiar ships an update, the bundled daemon may be a newer version than
  the user's state directory expects. The daemon's existing upgrade/migration
  logic applies.
- The bundled Node.js version should be pinned per Familiar release to avoid
  compatibility issues.
