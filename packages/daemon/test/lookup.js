import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

export const make = (_powers, _context, _options) => {
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
