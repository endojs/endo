// @ts-nocheck
/* global Far */
// `Far` is provided by the worker compartment's endowments at runtime.
// Avoid `import { Far } from '@endo/far'` because pulling in @endo/far
// also pulls @endo/errors, whose source contains a dynamic-call
// expression that SES rejects on archive load.
export const make = (_powers, _context, options = {}) => {
  // Snapshot env into a frozen copy so the XS marshaller (stricter
  // than Node's about extensible objects) accepts the result of
  // getEnv(). Object.freeze suffices because env values are strings.
  const frozenEnv = Object.freeze({ ...(options.env || {}) });
  return Far('EnvEchoFromEndoFs', {
    getEnv() {
      return frozenEnv;
    },
    getEnvVar(key) {
      return frozenEnv[key];
    },
  });
};
