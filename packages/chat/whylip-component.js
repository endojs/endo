// @ts-check

import harden from '@endo/harden';
import { E } from '@endo/far';
import { mountWhylip } from '@endo/whylip';

/**
 * Mount the Whylip interactive primer UI, replacing the entire body
 * content for this space. Resolves the fae agent from the profilePath
 * and passes it as a prop.
 *
 * @param {HTMLElement} $parent
 * @param {unknown} rootPowers
 * @param {string[]} profilePath
 * @param {(newPath: string[]) => void} onProfileChange
 * @returns {() => void} cleanup function
 */
export const whylipComponent = (
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

  return mountWhylip($parent, {
    powers: resolvedPowers,
    rootPowers,
    profilePath,
    onProfileChange,
  });
};
harden(whylipComponent);
