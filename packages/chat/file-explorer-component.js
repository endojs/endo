// @ts-check

import harden from '@endo/harden';

import { mountFileExplorer } from './file-explorer.js';

/**
 * Mount the endo-fs file explorer Space, replacing the parent
 * content. The explorer resolves filesystem objects on demand
 * (by pet name, or freshly created in-memory), so it only needs
 * the root host powers — the profile path and navigation callback
 * supplied by the Space dispatcher are unused.
 *
 * @param {HTMLElement} $parent
 * @param {unknown} rootPowers
 * @returns {(() => void) | null} cleanup function
 */
export const fileExplorerComponent = ($parent, rootPowers) => {
  $parent.innerHTML = '';
  return mountFileExplorer($parent, { rootPowers });
};
harden(fileExplorerComponent);
