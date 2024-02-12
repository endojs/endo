import { E, Far } from '@endo/far';

// A caplet that proxies the lookup method of its powers object.
// Useful for testing the behavior of pet name paths.

export const make = target => {
  return Far('Lookup proxy', {
    lookup(petName) {
      return E(target).lookup(petName);
    },
  });
};
