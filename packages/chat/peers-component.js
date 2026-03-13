// @ts-check

import harden from '@endo/harden';
import { E } from '@endo/far';
import { mountNetworkView } from '@endo/chat-network-view';

/**
 * Mount the network peers UI, replacing the parent content.
 * Resolves powers from the profilePath and delegates to the
 * @endo/chat-network-view package.
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
  $parent.innerHTML = '';

  /** @type {unknown} */
  let resolvedPowers = rootPowers;
  for (const name of profilePath) {
    resolvedPowers = E(/** @type {any} */ (resolvedPowers)).lookup(name);
  }

  return mountNetworkView($parent, {
    powers: resolvedPowers,
    rootPowers,
    profilePath,
    onProfileChange,
  });
};
harden(peersComponent);
