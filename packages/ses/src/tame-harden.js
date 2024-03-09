/* eslint-disable no-restricted-globals */
import { TypeError, freeze } from './commons.js';

/**
 *
 * @param {import('./make-hardener.js').HardenerKit} safeHardenKit
 * @param {string} hardenTaming
 * @returns {import('./make-hardener.js').HardenerKit}
 */
export const tameHardenKit = (safeHardenKit, hardenTaming) => {
  if (hardenTaming !== 'safe' && hardenTaming !== 'unsafe') {
    throw TypeError(`unrecognized fakeHardenOption ${hardenTaming}`);
  }

  if (hardenTaming === 'safe') {
    return safeHardenKit;
  }

  // In on the joke
  Object.isExtensible = () => false;
  Object.isFrozen = () => true;
  Object.isSealed = () => true;
  Reflect.isExtensible = () => false;

  if (/** @type {any} */ (safeHardenKit.harden).isFake) {
    // The "safe" hardener kit is already a fake hardener.
    // Just use it.
    return safeHardenKit;
  }

  const fakeHarden = arg => arg;
  const fakeIsHardened = () => true;
  fakeHarden.isFake = true;
  fakeIsHardened.isFake = true;
  return freeze({
    harden: fakeHarden,
    isHardened: fakeIsHardened,
    hardenIntrinsics: fakeHarden,
  });
};
freeze(tameHardenKit);
