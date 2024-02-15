import { E, Far } from '@endo/far';

export const make = async (_powers, context) => {
  return Far('Context consumer', {
    async awaitCancellation() {
      try {
        await E(context).whenCancelled();
      } catch {
        return 'cancelled';
      }
      throw new Error('should have been cancelled');
    },
  });
};
