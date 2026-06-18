// @ts-check
/**
 * `mountAsFilesystem(rootMount)` —
 * `wrapBackend(makeFromMountBackend(rootMount))`.
 *
 * The 655-line legacy implementation has been replaced with a thin
 * wrapper. The Mount→FsBackend adapter lives in
 * `backends/from-mount-backend.js`; all exo plumbing comes from
 * `wrap-backend.js`.
 *
 * See `designs/endo-fs-backend-seam.md` for the architecture.
 */

import { wrapBackend } from './wrap-backend.js';
import { makeFromMountBackend } from './backends/from-mount-backend.js';

/**
 * Project an `@endo/daemon` Mount cap into a endo-fs `Filesystem`.
 *
 * @param {object} rootMount
 * @returns {object}
 */
export const mountAsFilesystem = rootMount =>
  wrapBackend(makeFromMountBackend(rootMount), {
    description: 'Mount-adapted FS',
  });
harden(mountAsFilesystem);
