// @ts-nocheck
/* global E, Far */
// E and Far come from the worker compartment's endowments at runtime.
// Do NOT add explicit ES module imports: pulling in @endo/far would also
// pull @endo/errors, whose source contains a dynamic-call expression
// that SES rejects on archive load.
export const make = async (_powers, context) => {
  return Far('Context consumer', {
    async awaitCancellation() {
      await null;
      try {
        await E(context).whenCancelled();
      } catch {
        return 'cancelled';
      }
      throw new Error('should have been cancelled');
    },
  });
};
