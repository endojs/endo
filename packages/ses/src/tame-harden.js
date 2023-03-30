/* eslint-disable no-restricted-globals */
import { TypeError, freeze } from './commons.js';

export const tameHarden = (safeHarden, hardenTaming) => {
  if (hardenTaming !== 'safe' && hardenTaming !== 'unsafe') {
    throw new TypeError(`unrecognized fakeHardenOption ${hardenTaming}`);
  }

  if (hardenTaming === 'safe') {
    return safeHarden;
  }

  // In on the joke
  Object.isExtensible = () => false;
  Object.isFrozen = () => true;
  Object.isSealed = () => true;
  Reflect.isExtensible = () => false;

  const fakeHarden = arg => arg;
  fakeHarden.isFake = true;
  return freeze(fakeHarden);
};
freeze(tameHarden);
