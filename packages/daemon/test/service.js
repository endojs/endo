import { E } from '@endo/far';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

export const make = agent => {
  return makeExo(
    'Service',
    M.interface('Service', {}, { defaultGuards: 'passable' }),
    {
      async ask() {
        return E(agent).request(
          '@host',
          'the meaning of life, the universe, everything',
          'answer',
        );
      },
    },
  );
};
