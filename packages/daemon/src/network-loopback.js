import { Far } from '@endo/far';

export const make = nonceLocator => {
  return Far('Loopback Network', {
    addresses: () => ['loop:'],
    supports: address => new URL(address).protocol === 'loop:',
    connect: address => {
      if (address !== 'loop:') {
        throw new Error(
          'Failed invariant: loopback only supports loop: address',
        );
      }
      return nonceLocator;
    },
  });
};
