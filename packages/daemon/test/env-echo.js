import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

/**
 * A test fixture that echoes back the environment variables it was given.
 *
 * @param {unknown} _powers - The powers object (unused).
 * @param {unknown} _context - The context object (unused).
 * @param {object} options - Options including environment variables.
 * @param {Record<string, string>} [options.env] - Environment variables.
 */
export const make = (_powers, _context, { env = {} } = {}) => {
  return makeExo(
    'EnvEcho',
    M.interface('EnvEcho', {}, { defaultGuards: 'passable' }),
    {
      /**
       * Get all environment variables.
       * @returns {Record<string, string>}
       */
      getEnv() {
        return { ...env };
      },

      /**
       * Get a specific environment variable.
       * @param {string} key - The environment variable name.
       * @returns {string | undefined}
       */
      getEnvVar(key) {
        return env[key];
      },

      /**
       * Check if an environment variable exists.
       * @param {string} key - The environment variable name.
       * @returns {boolean}
       */
      hasEnvVar(key) {
        return key in env;
      },
    },
  );
};
