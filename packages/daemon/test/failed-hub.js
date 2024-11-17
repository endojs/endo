import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

export const make = () => {
  return makeExo(
    'FailedHub',
    M.interface('FailedHub', {}, { defaultGuards: 'passable' }),
    {
      write() {
        throw Error('I had one job.');
      },
    },
  );
};
