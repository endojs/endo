// @ts-nocheck
/* global Far */
// Far comes from the worker compartment's endowments at runtime.
// Do NOT add explicit ES module imports: pulling in @endo/far would also
// pull @endo/errors, whose source contains a dynamic-call expression
// that SES rejects on archive load.
export const make = (_powers, _context, options = {}) => {
  // Snapshot env into a frozen copy at construction time so the XS
  // marshaller (which is stricter than Node's about extensible
  // objects) accepts the result of getEnv().  Object.freeze suffices
  // here because env values are primitive strings.
  const frozenEnv = Object.freeze({ ...(options.env || {}) });
  return Far('EnvEchoFromArchive', {
    getEnv() {
      return frozenEnv;
    },
    getEnvVar(key) {
      return frozenEnv[key];
    },
    hasEnvVar(key) {
      return Object.prototype.hasOwnProperty.call(frozenEnv, key);
    },
  });
};
