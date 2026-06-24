// @ts-check
/**
 * In-memory `Filesystem` — `wrapBackend(makeInMemoryBackend())`.
 *
 * The 788-line legacy implementation has been replaced with a thin
 * wrapper over the shared three-layer architecture. The in-memory
 * FsBackend lives in `backends/in-memory-backend.js`; all exo
 * plumbing (Directory, File, OpenFile, Cursor, NodeWatcher, Xattrs)
 * comes from `wrap-backend.js`.
 *
 * See `designs/endo-fs-backend-seam.md` for the architecture.
 */

import { wrapBackend } from './wrap-backend.js';
import { makeInMemoryBackend } from './backends/in-memory-backend.js';

/**
 * Build an in-memory `Filesystem` cap.
 *
 * @returns {object}
 */
export const makeInMemoryFilesystem = () =>
  wrapBackend(makeInMemoryBackend(), { description: 'in-memory FS' });
harden(makeInMemoryFilesystem);
