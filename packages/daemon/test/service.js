import { E, Far } from '@endo/far';

export const provide0 = powers => {
  return Far('Service', {
    async ask() {
      return E(powers).request(
        'the meaning of life, the universe, everything',
        'answer',
      );
    },
  });
};
