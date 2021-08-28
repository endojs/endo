// @ts-check

// environment-options needs to be imported quite early, and so should
// avoid importing from anything but commons.js and assert.js
import { Object, globalThis } from './commons.js';
import { assert } from './error/assert.js';

const { details: X, quote: q } = assert;

/**
 * So that this module can be used either before or after lockdown, we
 * use `Object.freeze` manually, rather than `harden`.
 */
const { freeze } = Object;

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
 * `ALLOW_IMPLICIT_REMOTABLES` it would look in
 * `globalThis.process.env.ALLOW_IMPLICIT_REMOTABLES`.
 *
 * If setting is either absent or `undefined`, that indicates that
 * this configuration option should have its default behavior, whatever that is.
 * Otherwise, reflecting Unix environment variables, the setting must be a
 * string. This also helps ensure that this channel is used only to pass data,
 * not authority beyond the ability to read this global state.
 *
 * @param {string} optionName
 * @param {string=} defaultSetting
 * @returns {string=}
 */
export const getEnvironmentOption = (
  optionName,
  defaultSetting = undefined,
) => {
  // eslint-disable-next-line @endo/no-polymorphic-call
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
        // eslint-disable-next-line @endo/no-polymorphic-call
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
// Since `getEnvironmentOption` is just an arrow function, `freeze` should
// adequately harden.
freeze(getEnvironmentOption);

/**
 * Set `globalThis.process.env[optionName]` to `setting`.
 *
 * This function takes care of the complexity that `process` may or may not
 * already exist, `process.env` may or may not already exist, and if both
 * exist, this function should mutate only this one property setting, minimizing
 * other damage to a shared `globalThis.process.env`.
 *
 * @param {string} optionName
 * @param {string} setting
 */
export const setEnvironmentOption = (optionName, setting) => {
  // eslint-disable-next-line @endo/no-polymorphic-call
  assert.typeof(
    optionName,
    'string',
    X`Environment option name ${q(optionName)} must be a string.`,
  );
  // eslint-disable-next-line @endo/no-polymorphic-call
  assert.typeof(
    setting,
    'string',
    X`Environment option value ${q(setting)} must be a string`,
  );
  if (!('process' in globalThis)) {
    // @ts-ignore TS assumes this is the Node process object.
    globalThis.process = {};
  }
  const globalProcess = globalThis.process;
  // eslint-disable-next-line @endo/no-polymorphic-call
  assert.typeof(
    globalProcess,
    'object',
    X`Expected globalThis.process, if present, to be an object: ${globalProcess}`,
  );
  if (!('env' in globalProcess)) {
    // @ts-ignore Sometimes TS thinks globalProcess is type `never`
    // TODO Why? And why under `yarn lint` but not in vscode?
    globalProcess.env = {};
  }
  const env = globalProcess.env;
  // eslint-disable-next-line @endo/no-polymorphic-call
  assert.typeof(
    env,
    'object',
    X`Expected globalThis.process.env, if present, to be an object: ${env}`,
  );
  if (optionName in env) {
    // eslint-disable-next-line @endo/no-polymorphic-call
    console.log(`Overwriting apparent environment variable ${q(optionName)}`);
  }
  env[optionName] = setting;
};
// Since `setEnvironmentOption` is just an arrow function, `freeze` should
// adequately harden.
freeze(setEnvironmentOption);
