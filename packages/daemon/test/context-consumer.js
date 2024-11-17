import { E } from '@endo/far';
import { M } from '@endo/patterns';
import { makeExo } from '@endo/exo';

export const ContextConsumerInterface = M.interface(
  'Context consumer',
  {},
  { defaultGuards: 'passable' },
);

export const make = async (_powers, context) => {
  return makeExo('Context consumer', ContextConsumerInterface, {
    async awaitCancellation() {
      await null;
      try {
        await E(context).whenCancelled();
      } catch {
        return 'cancelled';
      }
      throw Error('should have been cancelled');
    },
  });
};
