import { Far } from '@endo/far';

export const make = () => {
  return Far('Lookup', {
    lookup(petName) {
      return `Looked up: ${petName}`;
    },
  });
};
