import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

export const make = (_powers, _context, _options) => {
  return makeExo(
    'FailedHub',
    M.interface('FailedHub', {}, { defaultGuards: 'passable' }),
    {
      write() {
        throw new Error('I had one job.');
      },
    },
  );
};
