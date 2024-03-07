import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

export const make = () => {
  return makeExo(
    'Lookup',
    M.interface('Lookup', {}, { defaultGuards: 'passable' }),
    {
      lookup(petName) {
        return `Looked up: ${petName}`;
      },
    },
  );
};
