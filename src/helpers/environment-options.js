// @ts-check
/* global globalThis */

// Note: Might need to be imported quite early, so this module should
// avoid importing other things.

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
 *         recommened usage pattern, packages-wide.
 *       * The global lexical scope. The SES-shim compartments supports
 *         these both compartment-wide as well as per-module. But it is
 *         not yet clear what we will propose in the Compartment proposal.
 *    * The import namespace.
 *    * The host hooks.
 *
 * This `environment-options.js` module looks for a setting of of an
 * `optionName` parameter rooted in the global scope. If follows the Node
 * precedent for finding Unix environment variable settings, looking for a
 * global `process` object holding an `env` object,
 * optionally holding a property named for the `optionName` whose value is the
 * configuration setting of that option. For example, for the optionName
 * `ALLOW_IMPLICIT_REMOTABLES` it would look in
 * `globalThis.process.env.ALLOW_IMPLICIT_REMOTABLES`.
 *
 * If setting is either absent or `undefined`, that indicates that
 * this configuration option should have its default behavior, whatever that is.
 * Otherwise, reflecting Unix environment variables, the setting must be a
 * string. This also helps ensure that this channel is used only to pass data,
 * not authority beyond the ability to read this global state.
 *
 * The current placement of this `environment-options.js` module in the
 * `@agoric/marshal` package is a stopgap measure.
 * TODO the intention is to migrate it into Endo, and to migrate all our
 * direct uses of `process.env` for configuration parameters to use it
 * instead.
 *
 * Even after that migration, this module will still not be used for
 * `LOCKDOWN_OPTIONS` itself, since that must happen before `lockdown`,
 * whereas this module must initialize after `lockdown`.
 *
 * @param {string} optionName
 * @param {string=} defaultSetting
 */
export const getEnvironmentOption = (
  optionName,
  defaultSetting = undefined,
) => {
  assert.typeof(
    optionName,
    'string',
    X`Environment option name ${q(optionName)} must be a string.`,
  );
  assert(
    defaultSetting === undefined || typeof defaultSetting === 'string',
    X`Environment option default setting ${q(
      defaultSetting,
    )}, if present, must be a string.`,
  );

  let setting = defaultSetting;
  const globalProcess = globalThis.process;
  if (globalProcess && typeof globalProcess === 'object') {
    const globalEnv = globalProcess.env;
    if (globalEnv && typeof globalEnv === 'object') {
      if (optionName in globalEnv) {
        console.log(
          `Environment options sniffed and found an apparent ${q(
            optionName,
          )} environment variable.\n`,
        );
        setting = globalEnv[optionName];
      }
    }
  }
  assert(
    setting === undefined || typeof setting === 'string',
    X`Environment option value ${q(setting)}, if present, must be a string.`,
  );
  return setting;
};
harden(getEnvironmentOption);

/**
 * Set `globalThis.process.env[optionName]` to `setting`.
 *
 * This function takes care of the complexity that `process` may or may not
 * already exist, `process.env` may or may not already exist, and if both
 * exist, this function should mutate only this one property setting, minimizing
 * other damage to a shared `globalThis.process.env`.
 *
 * @param {string} optionName
 * @param {string=} setting
 */
export const setEnvironmentOption = (optionName, setting) => {
  assert.typeof(optionName, 'string');
  assert(setting === undefined || typeof setting === 'string');
  if (!('process' in globalThis)) {
    // @ts-ignore TS assumes this is the Node process object.
    globalThis.process = {};
  }
  const globalProcess = globalThis.process;
  assert.typeof(globalProcess, 'object');
  if (!('env' in globalProcess)) {
    // @ts-ignore TS assumes this is the Node process object.
    globalProcess.env = {};
  }
  const env = globalProcess.env;
  assert.typeof(env, 'object');
  if (optionName in env) {
    console.log(`Overwriting apparent environment variable ${q(optionName)}`);
  }
  env[optionName] = setting;
};
harden(setEnvironmentOption);
