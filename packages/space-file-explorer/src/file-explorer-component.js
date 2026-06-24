// @ts-check

import harden from '@endo/harden';
import { h, renderConfined, unmount } from '@endo/preact-container/renderer';

import { FileExplorerApp } from './preact/FileExplorerApp.js';

/**
 * Mount the endo-fs file explorer Space, replacing the parent content. The
 * explorer hangs everything off the profile's host powers: the inventory
 * sidebar lists pet names at the active profile, "Open by pet name" walks the
 * same NameHub, and "Save as…" actions (read-only view, layer) store the new
 * filesystem object alongside the user's other inventory entries.
 *
 * The `FileExplorerApp` component tree renders through the project's CONFINED
 * renderer, so the whole tree is sanitized exactly like every other surface in
 * the app (refs stripped, dangerous tags/attrs removed, event handlers given a
 * frozen `SafeEvent`). The component holds no authority of its own — all
 * capability authority lives in the store hook, which walks `profilePath` from
 * `rootPowers` to reach the active profile host.
 *
 * `onProfileChange` is not used here — the file-explorer doesn't expose a
 * profile-switch control of its own; switching profiles happens via the spaces
 * gutter (which re-mounts this component).
 *
 * @param {HTMLElement} $parent
 * @param {unknown} rootPowers
 * @param {string[]} [profilePath]
 * @param {(newPath: string[]) => void} [_onProfileChange]
 * @returns {() => void} cleanup function
 */
export const fileExplorerComponent = (
  $parent,
  rootPowers,
  profilePath,
  _onProfileChange,
) => {
  $parent.innerHTML = '';

  // Dedicated mount child so teardown removes exactly what we added.
  const $mount = $parent.ownerDocument.createElement('div');
  $parent.appendChild($mount);

  renderConfined(
    h(FileExplorerApp, {
      powers: rootPowers,
      profilePath: profilePath || [],
    }),
    $mount,
  );

  return () => {
    // Unmount runs the component's useEffect teardowns (cancels the inventory
    // follow loop and the directory watchers) and tears down the confined
    // Preact tree, then removes the mount node from the DOM.
    unmount($mount);
    $mount.remove();
  };
};
harden(fileExplorerComponent);
