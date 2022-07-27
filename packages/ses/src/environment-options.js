// @ts-check

// environment-options needs to be imported quite early, and so should
// avoid importing from anything but commons.js and assert.js
import { arrayPush, arraySlice, freeze } from './commons.js';
import { assert } from './error/assert.js';

const { details: X, quote: q } = assert;

/**
 * JavaScript module semantics resists attempts to parameterize a module's
 * initialization behavior. A module initializes in order according to
 * the path by which it is first imported, and then the initialized module
 * is reused by all the other times it is imported. Compartments give us
 * the opportunity to bind the same import name to different imported
 * modules, depending on the package/compartment doing the import. Compartments
 * also address the difficulty of parameterizing a module's initialization
 * logic, but not in a pleasant manner.
 *
 * A pleasant parameterization would be for a static module to be function-like
 * with explicit parameters, and for the parameterization to be like
 * calling the static module with parameters in order to derive from it a
 * module instance. Compartments instead lets us parameterize the meaning
 * of a module instance derived from a static module according to the
 * three namespaces provided by the JavaScript semantics, affecting the
 * meaning of a module instance.
 *    * The global variable namespaces.
 *       * The global scope, aliased to properties of the global object.
 *         This is necessarily compartment-wide, and therefore in our
 *         recommened usage pattern, package-wide.
 *       * The global lexical scope. The SES-shim compartments support
 *         these both compartment-wide as well as per-module. But it is
 *         not yet clear what we will propose in the Compartment proposal.
 *    * The import namespace.
 *    * The host hooks.
 *
 * This `environment-options.js` module looks for a setting of an
 * `optionName` parameter rooted in the global scope. If follows the Node
 * precedent for finding Unix environment variable settings, looking for a
 * global `process` object holding an `env` object,
 * optionally holding a property named for the `optionName` whose value is the
 * configuration setting of that option. For example, for the optionName
 * `FOO_BAR` it would look in
 * `globalThis.process.env.FOO_BAR`.
 *
 * If setting is either absent or `undefined`, that indicates that
 * this configuration option should have its default behavior, whatever that is.
 * Otherwise, reflecting Unix environment variables, the setting must be a
 * string. This also helps ensure that this channel is used only to pass data,
 * not authority beyond the ability to read this global state.
 */

/**
 * makeEnvironmentCaptor provides a mechanism for getting environment
 * variables, if they are needed, and a way to catalog the names of all
 * the environment variables that were captured.
 *
 * @param {Object} aGlobal
 */
export const makeEnvironmentCaptor = aGlobal => {
  const capturedEnvironmentOptionNames = [];

  /**
   * Gets an environment option by name and returns the option value or the
   * given default.
   *
   * @param {string} optionName
   * @param {string} defaultSetting
   * @returns {string}
   */
  const getEnvironmentOption = (optionName, defaultSetting) => {
    // eslint-disable-next-line @endo/no-polymorphic-call
    assert.typeof(
      optionName,
      'string',
      X`Environment option name ${q(optionName)} must be a string.`,
    );
    // eslint-disable-next-line @endo/no-polymorphic-call
    assert.typeof(
      defaultSetting,
      'string',
      X`Environment option default setting ${q(
        defaultSetting,
      )} must be a string.`,
    );

    /** @type {string} */
    let setting = defaultSetting;
    const globalProcess = aGlobal.process;
    if (globalProcess && typeof globalProcess === 'object') {
      const globalEnv = globalProcess.env;
      if (globalEnv && typeof globalEnv === 'object') {
        if (optionName in globalEnv) {
          arrayPush(capturedEnvironmentOptionNames, optionName);
          const optionValue = globalEnv[optionName];
          // eslint-disable-next-line @endo/no-polymorphic-call
          assert.typeof(
            optionValue,
            'string',
            X`Environment option named ${q(
              optionName,
            )}, if present, must have a corresponding string value, got ${q(
              optionValue,
            )}`,
          );
          setting = optionValue;
        }
      }
    }
    assert(
      setting === undefined || typeof setting === 'string',
      X`Environment option value ${q(setting)}, if present, must be a string.`,
    );
    return setting;
  };
  freeze(getEnvironmentOption);

  const getCapturedEnvironmentOptionNames = () => {
    return freeze(arraySlice(capturedEnvironmentOptionNames));
  };
  freeze(getCapturedEnvironmentOptionNames);

  return { getEnvironmentOption, getCapturedEnvironmentOptionNames };
};
freeze(makeEnvironmentCaptor);
