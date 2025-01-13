/* eslint-disable no-restricted-globals */
import { freeze } from './commons.js';

/** @import {Harden} from '../types.js'; */

/** @type {(safeHarden: Harden, hardenTaming: 'safe' | 'unsafe') => Harden} */
export const tameHarden = (safeHarden, hardenTaming) => {
  if (hardenTaming === 'safe') {
    return safeHarden;
  }

  // In on the joke
  Object.isExtensible = () => false;
  Object.isFrozen = () => true;
  Object.isSealed = () => true;
  Reflect.isExtensible = () => false;

  // @ts-expect-error secret property
  if (safeHarden.isFake) {
    // The "safe" hardener is already a fake hardener.
    // Just use it.
    return safeHarden;
  }

  const fakeHarden = arg => arg;
  fakeHarden.isFake = true;
  return freeze(fakeHarden);
};
freeze(tameHarden);
