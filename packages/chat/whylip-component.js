// @ts-check

import harden from '@endo/harden';
import { E } from '@endo/far';
import { WhylipApp } from '@endo/space-whylip';

import { h, renderConfined, unmount } from './setup-preact-container.js';

/**
 * Mount the Whylip interactive primer UI, replacing the entire body
 * content for this space. Resolves the fae agent from the profilePath
 * and passes it as a prop.
 *
 * Whylip's component tree (including SceneCanvas's untrusted model-generated
 * scene markup) is rendered through the project's CONFINED renderer, so the
 * whole tree is sanitized exactly like every other surface in the app.
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

  // Dedicated mount child so teardown removes exactly what we added.
  const $mount = $parent.ownerDocument.createElement('div');
  $mount.id = 'whylip-root';
  $parent.appendChild($mount);

  renderConfined(
    h(WhylipApp, {
      powers: resolvedPowers,
      rootPowers,
      profilePath,
      onProfileChange,
    }),
    $mount,
  );

  return () => {
    // Unmount runs the component's useEffect teardown (cancels the message
    // subscription) and tears down the confined Preact tree, then removes the
    // mount node from the DOM.
    unmount($mount);
    $mount.remove();
  };
};
harden(whylipComponent);
