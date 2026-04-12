// @ts-check

import harden from '@endo/harden';
import { E } from '@endo/far';
import { mountInventoryGraph } from '@endo/inventory-graph';

/**
 * Mount the inventory graph UI, replacing the parent content.
 * Resolves powers from the profilePath and delegates to the
 * @endo/inventory-graph package.
 *
 * @param {HTMLElement} $parent
 * @param {unknown} rootPowers
 * @param {string[]} profilePath
 * @param {(newPath: string[]) => void} onProfileChange
 * @returns {() => void} cleanup function
 */
export const inventoryGraphComponent = (
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

  return mountInventoryGraph($parent, {
    powers: resolvedPowers,
    rootPowers,
    profilePath,
    onProfileChange,
  });
};
harden(inventoryGraphComponent);
