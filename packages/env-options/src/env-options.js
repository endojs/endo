// @ts-check

// `@endo/env-options` needs to be imported quite early, and so should
// avoid importing from ses or anything that depends on ses.

// /////////////////////////////////////////////////////////////////////////////
// Prelude of cheap good - enough imitations of things we'd use or
// do differently if we could depend on ses

const { freeze } = Object;
const { apply } = Reflect;

// Should be equivalent to the one in ses' commons.js even though it
// uses the other technique.
const uncurryThis =
  fn =>
  (receiver, ...args) =>
    apply(fn, receiver, args);
const arrayPush = uncurryThis(Array.prototype.push);

const q = JSON.stringify;

const Fail = (literals, ...args) => {
  let msg = literals[0];
  for (let i = 0; i < args.length; i += 1) {
    msg = `${msg}${args[i]}${literals[i + 1]}`;
  }
  throw Error(msg);
};

// end prelude
// /////////////////////////////////////////////////////////////////////////////

/**
 * `makeEnvironmentCaptor` provides a mechanism for getting environment
 * variables, if they are needed, and a way to catalog the names of all
 * the environment variables that were captured.
 *
 * @param {object} aGlobal
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
    typeof optionName === 'string' ||
      Fail`Environment option name ${q(optionName)} must be a string.`;
    // eslint-disable-next-line @endo/no-polymorphic-call
    typeof defaultSetting === 'string' ||
      Fail`Environment option default setting ${q(
        defaultSetting,
      )} must be a string.`;

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
          typeof optionValue === 'string' ||
            Fail`Environment option named ${q(
              optionName,
            )}, if present, must have a corresponding string value, got ${q(
              optionValue,
            )}`;
          setting = optionValue;
        }
      }
    }
    return setting;
  };
  freeze(getEnvironmentOption);

  const getCapturedEnvironmentOptionNames = () => {
    return freeze([...capturedEnvironmentOptionNames]);
  };
  freeze(getCapturedEnvironmentOptionNames);

  return freeze({ getEnvironmentOption, getCapturedEnvironmentOptionNames });
};
freeze(makeEnvironmentCaptor);
