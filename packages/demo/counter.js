import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

export const make = () => {
  let counter = 0;
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
