// @ts-nocheck
/* global E, Far */
// E and Far come from the worker compartment's endowments at runtime.
// Do NOT add explicit ES module imports: pulling in @endo/far would also
// pull @endo/errors, whose source contains a dynamic-call expression
// that SES rejects on archive load.
export const make = agent => {
  return Far('Service', {
    async ask() {
      return E(agent).request(
        '@host',
        'the meaning of life, the universe, everything',
        'answer',
      );
    },
  });
};
