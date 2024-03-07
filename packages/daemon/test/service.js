import { E } from '@endo/far';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

export const make = powers => {
  return makeExo(
    'Service',
    M.interface('Service', {}, { defaultGuards: 'passable' }),
    {
      async ask() {
        return E(powers).request(
          'HOST',
          'the meaning of life, the universe, everything',
          'answer',
        );
      },
    },
  );
};
