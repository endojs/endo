// @ts-check

/**
 * Spawner abstraction for the `bash` / `exec` / `git` command tools.
 *
 * The `Spawner` seam — `spawn(argv, opts) -> ProcessLike` — and its default
 * host engine `makeHostSpawner` now live in the standalone `@endo/host-spawner`
 * package, so daemon-side capabilities (the Shell formula) can reach the same
 * engine without depending on this agent framework (which depends on
 * `@endo/daemon`, so the daemon cannot depend back on genie).  This module
 * re-exports them unchanged so every in-tree `./spawner.js` importer — and the
 * `import('./spawner.js').Spawner` type references scattered across genie — keep
 * resolving exactly as before.  The sandbox engine (`./sandbox-spawner.js`)
 * remains genie-local.
 */

export { makeHostSpawner } from '@endo/host-spawner';

/** @typedef {import('@endo/host-spawner').SpawnerOpts} SpawnerOpts */
/** @typedef {import('@endo/host-spawner').ProcessLike} ProcessLike */
/** @typedef {import('@endo/host-spawner').Spawner} Spawner */
