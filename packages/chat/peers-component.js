// @ts-check

import harden from '@endo/harden';
import { E } from '@endo/far';
import { PeersView } from '@endo/chat-network-view';

import { h, renderConfined, unmount } from './setup-preact-container.js';

/**
 * Mount the network peers UI, replacing the parent content. Resolves powers
 * from the profilePath and renders the `@endo/chat-network-view` package's
 * pure `PeersView` component through the project's CONFINED renderer, so the
 * whole tree is sanitized exactly like every other surface in the app.
 *
 * @param {HTMLElement} $parent
 * @param {unknown} rootPowers
 * @param {string[]} profilePath
 * @param {(newPath: string[]) => void} onProfileChange
 * @returns {() => void} cleanup function
 */
export const peersComponent = (
  $parent,
  rootPowers,
  profilePath,
  onProfileChange,
) => {
  $parent.replaceChildren();

  /** @type {unknown} */
  let resolvedPowers = rootPowers;
  for (const name of profilePath) {
    resolvedPowers = E(/** @type {any} */ (resolvedPowers)).lookup(name);
  }

  // Dedicated mount child so teardown removes exactly what we added.
  const $mount = $parent.ownerDocument.createElement('div');
  $mount.id = 'peers-root';
  $mount.style.width = '100%';
  $mount.style.height = '100%';
  $parent.appendChild($mount);

  renderConfined(
    h(PeersView, {
      powers: resolvedPowers,
      rootPowers,
      profilePath,
      onProfileChange,
    }),
    $mount,
  );

  return () => {
    // Unmount runs the component's useEffect teardown (cancels the peer-change
    // subscription) and tears down the confined Preact tree, then removes the
    // mount node from the DOM.
    unmount($mount);
    $mount.remove();
  };
};
harden(peersComponent);
