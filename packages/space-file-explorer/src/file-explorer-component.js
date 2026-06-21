// @ts-check

import harden from '@endo/harden';

import { mountFileExplorer } from './file-explorer.js';

/**
 * Mount the endo-fs file explorer Space, replacing the parent
 * content. The explorer hangs everything off the profile's host
 * powers: the inventory sidebar lists pet names at the active
 * profile, "Open by pet name" walks the same NameHub, and "Save
 * as…" actions (read-only view, layer) call `storeValue` against
 * it so the new filesystem object lands alongside the user's
 * other inventory entries.
 *
 * `onProfileChange` is not used here — the file-explorer doesn't
 * expose a profile-switch control of its own; switching profiles
 * happens via the spaces gutter (which re-mounts this component).
 *
 * @param {HTMLElement} $parent
 * @param {unknown} rootPowers
 * @param {string[]} [profilePath]
 * @param {(newPath: string[]) => void} [_onProfileChange]
 * @returns {(() => void) | null} cleanup function
 */
export const fileExplorerComponent = (
  $parent,
  rootPowers,
  profilePath,
  _onProfileChange,
) => {
  $parent.innerHTML = '';
  return mountFileExplorer($parent, {
    rootPowers,
    profilePath: profilePath || [],
  });
};
harden(fileExplorerComponent);
