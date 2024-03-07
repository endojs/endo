import { E } from '@endo/far';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

export const make = powers => {
  const counter = E(powers).request(
    'HOST',
    'a counter, suitable for doubling',
    'my-counter',
  );
  return makeExo(
    'Doubler',
    M.interface('Doubler', {}, { defaultGuards: 'passable' }),
    {
      async incr() {
        const n = await E(counter).incr();
        return n * 2;
      },
    },
  );
};
