// @ts-check

/**
 * Pet names the genie launcher (`packages/genie/setup.js`) and root
 * worker (`packages/genie/main.js`) agree on at the host pet-store
 * boundary.  Kept in one module so the two files cannot drift on the
 * spelling.
 *
 * Each name is the operator-visible identifier the launcher pins under
 * the daemon's host agent — `setup.js` populates them on first
 * `bottle.sh invoke`, and `main.js` resolves them from `powers` on boot
 * (see `TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md`
 * § Decisions 1 + 3 for the rationale: the slice is minted main-side
 * because `MakeCapletOptionsShape` has no `introducedNames` channel
 * today, so the supporting capabilities must live in the host pet
 * store rather than be threaded through `makeUnconfined`'s `env`).
 */

/**
 * Pet name under which the host agent pins the workspace `Mount`
 * capability covering `GENIE_WORKSPACE`.  `setup.js` calls
 * `provideMount` to create it; `main.js` looks it up to thread into
 * the sandbox slice's `mounts: [{ cap, innerPath: '/workspace',
 * mode: 'rw' }]` array.
 */
export const WORKSPACE_MOUNT_NAME = 'workspace-mount';
harden(WORKSPACE_MOUNT_NAME);

/**
 * Pet name under which the host agent pins the `SandboxFactory` exo
 * returned by `@endo/sandbox`'s `make-unconfined` entry point.
 * `setup.js` registers it; `main.js` resolves it on boot to mint the
 * workspace slice.
 */
export const SANDBOX_FACTORY_NAME = 'sandbox-factory';
harden(SANDBOX_FACTORY_NAME);

/**
 * Pet name `main.js` passes to `SandboxFactory.makePersistent` so the
 * resulting `SandboxHandle` is GC-pinned and reincarnated on daemon
 * restart from the same recorded spec
 * (`TADA/33_endo_genie_sandbox_persist_slice.md`).
 *
 * Setup-side code does not reference this name — only the worker mints
 * the slice — but it is centralised here so a future setup-side hook
 * (e.g. a `forgetPersistent` cleanup) can use the same identifier
 * without re-deriving it.
 */
export const SANDBOX_SLICE_NAME = 'main-genie-sandbox';
harden(SANDBOX_SLICE_NAME);
