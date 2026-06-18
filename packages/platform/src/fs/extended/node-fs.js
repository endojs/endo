// @ts-check
/**
 * `node:fs/promises`-backed `Filesystem` —
 * `wrapBackend(makeNodeFsBackend({ rootPath }))`.
 *
 * The 859-line legacy implementation has been replaced with a thin
 * wrapper. The node-fs FsBackend lives in
 * `backends/node-fs-backend.js`; all exo plumbing (Directory, File,
 * OpenFile, Cursor, NodeWatcher, Xattrs) comes from
 * `wrap-backend.js`.
 *
 * See `designs/endo-fs-backend-seam.md` for the architecture.
 */

import { wrapBackend } from './wrap-backend.js';
import { makeNodeFsBackend } from './backends/node-fs-backend.js';

/**
 * Build a `Filesystem` rooted at an absolute `rootPath` on the host
 * filesystem. Symlink containment (`realpath` must stay inside
 * `rootPath`) is enforced by the backend.
 *
 * @param {{ rootPath: string }} opts
 * @returns {object}
 */
export const makeNodeFilesystem = ({ rootPath }) =>
  wrapBackend(makeNodeFsBackend({ rootPath }), {
    description: `node:fs FS rooted at ${rootPath}`,
  });
harden(makeNodeFilesystem);
