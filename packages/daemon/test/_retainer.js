import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

export const make = () => {
  let retained;
  return makeExo(
    'Retainer',
    M.interface('Retainer', {}, { defaultGuards: 'passable' }),
    {
      retain(value) {
        retained = value;
      },
      get() {
        return retained;
      },
    },
  );
};
