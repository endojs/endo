import { E } from '@endo/far';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

export const make = async (_powers, context) => {
  return makeExo(
    'Context consumer',
    M.interface('Context consumer', {}, { defaultGuards: 'passable' }),
    {
      async awaitCancellation() {
        try {
          await E(context).whenCancelled();
        } catch {
          return 'cancelled';
        }
        throw new Error('should have been cancelled');
      },
    },
  );
};
