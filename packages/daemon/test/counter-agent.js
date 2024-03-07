import { E } from '@endo/far';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

export const make = async powers => {
  let counter = await E(powers).request('HOST', 'starting number', 'start');
  return makeExo(
    'Counter',
    M.interface('Counter', {}, { defaultGuards: 'passable' }),
    {
      incr() {
        counter += 1;
        return counter;
      },
    },
  );
};
