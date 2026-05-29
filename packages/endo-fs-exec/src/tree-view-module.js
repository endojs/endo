// @ts-check
/**
 * Entry point for instantiating a `TreeView` over an `@endo/endo-fs`
 * `Filesystem` as a formulated Endo caplet via `host.makeUnconfined`.
 *
 * Composing this with `host.makeFromTree` lets a project tree hosted
 * in endo-fs drive `@endo/daemon`'s `make-from-tree` formula. The
 * program at the tree's root (a compartment-mapper layout:
 * `compartment-map.json` plus modules) is expected to
 * `export const make = (powers, context, { env }) => exo`; that
 * exo becomes the formula value. No custom formula type is
 * introduced — only `make-unconfined` and `make-from-tree`.
 *
 * Configuration:
 *
 *   --powers <fs-cap>          A endo-fs Filesystem cap (e.g.
 *                              instantiated from `node-fs-module.js`
 *                              or `in-memory-module.js`).
 *
 *   ENDO_FS_TREE_LOCATION      Optional. Slash-separated sub-path
 *                              within the Filesystem to use as the
 *                              tree root. Defaults to the
 *                              Filesystem's root.
 *
 * End-to-end recipe:
 *
 *   # 1. Mount a host directory as a Filesystem cap.
 *   endo make --UNCONFINED packages/endo-fs/src/node-fs-module.js \
 *     --name workspace-fs --workerName @node \
 *     --env ENDO_FS_ROOT=/path/to/project
 *
 *   # 2. Adapt it to make-from-tree's shape, optionally rebased.
 *   endo make --UNCONFINED \
 *     packages/endo-fs-exec/src/tree-view-module.js \
 *     --name my-app-tree --workerName @node \
 *     --powers workspace-fs \
 *     --env ENDO_FS_TREE_LOCATION=apps/my-app
 *
 *   # 3. Run as an ordinary make-from-tree formula.
 *   endo make-from-tree my-app-tree --name my-app --powers <powers>
 */

import { makeTreeView } from './tree-view.js';

/**
 * @param {object} powers  The Filesystem cap, passed via
 *   `makeUnconfined({ powers })`.
 * @param {unknown} _context
 * @param {{ env?: Record<string, string> }} [opts]
 * @returns {object}
 */
export const make = (powers, _context, opts = {}) => {
  const env = opts.env || {};
  const subPath = env.ENDO_FS_TREE_LOCATION;
  if (subPath !== undefined && typeof subPath !== 'string') {
    throw new Error(
      'tree-view-module: env.ENDO_FS_TREE_LOCATION must be a string when set',
    );
  }
  return makeTreeView(powers, { subPath: subPath || '' });
};
harden(make);
