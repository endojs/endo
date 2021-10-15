// Copyright (C) 2018 Agoric
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// @ts-check

import {
  arrayFilter,
  arrayMap,
  globalThis,
  is,
  keys,
  ownKeys,
  stringSplit,
} from './commons.js';
import { enJoin } from './error/stringify-utils.js';
import { makeHardener } from './make-hardener.js';
import { makeIntrinsicsCollector } from './intrinsics.js';
import whitelistIntrinsics from './whitelist-intrinsics.js';
import tameFunctionConstructors from './tame-function-constructors.js';
import tameDateConstructor from './tame-date-constructor.js';
import tameMathObject from './tame-math-object.js';
import tameRegExpConstructor from './tame-regexp-constructor.js';
import enablePropertyOverrides from './enable-property-overrides.js';
import tameLocaleMethods from './tame-locale-methods.js';
import {
  setGlobalObjectConstantProperties,
  setGlobalObjectMutableProperties,
} from './global-object.js';
import { makeSafeEvaluator } from './make-safe-evaluator.js';
import { initialGlobalPropertyNames } from './whitelist.js';
import { tameFunctionToString } from './tame-function-tostring.js';
import { tameDomains } from './tame-domains.js';

import { tameConsole } from './error/tame-console.js';
import tameErrorConstructor from './error/tame-error-constructor.js';
import { assert, makeAssert } from './error/assert.js';
import { makeEnvironmentCaptor } from './environment-options.js';
import { getAnonymousIntrinsics } from './get-anonymous-intrinsics.js';
import { makeCompartmentConstructor } from './compartment-shim.js';

/** @typedef {import('../index.js').LockdownOptions} LockdownOptions */

const { details: d, quote: q } = assert;

let firstOptions;

// Build a harden() with an empty fringe.
// Gate it on lockdown.
/**
 * @template T
 * @param {T} ref
 * @returns {T}
 */
const harden = makeHardener();

const alreadyHardenedIntrinsics = () => false;

/**
 * @callback Transform
 * @param {string} source
 * @returns {string}
 */

/**
 * @callback CompartmentConstructor
 * @param {Object} endowments
 * @param {Object} moduleMap
 * @param {Object} [options]
 * @param {Array<Transform>} [options.transforms]
 * @param {Array<Transform>} [options.__shimTransforms__]
 * @param {Object} [options.globalLexicals]
 */

// TODO https://github.com/endojs/endo/issues/814
// Lockdown currently allows multiple calls provided that the specified options
// of every call agree.  With experience, we have observed that lockdown should
// only ever need to be called once and that simplifying lockdown will improve
// the quality of audits.

/**
 * @param {LockdownOptions} [options]
 * @returns {() => {}} repairIntrinsics
 */
export const repairIntrinsics = (options = {}) => {
  // First time, absent options default to 'safe'.
  // Subsequent times, absent options default to first options.
  // Thus, all present options must agree with first options.
  // Reconstructing `option` here also ensures that it is a well
  // behaved record, with only own data properties.
  //
  // The `overrideTaming` is not a safety issue. Rather it is a tradeoff
  // between code compatibility, which is better with the `'moderate'`
  // setting, and tool compatibility, which is better with the `'min'`
  // setting. See
  // https://github.com/Agoric/SES-shim/blob/master/packages/ses/README.md#enabling-override-by-assignment)
  // for an explanation of when to use which.
  //
  // The `stackFiltering` is not a safety issue. Rather it is a tradeoff
  // between relevance and completeness of the stack frames shown on the
  // console. Setting`stackFiltering` to `'verbose'` applies no filters, providing
  // the raw stack frames that can be quite versbose. Setting
  // `stackFrameFiltering` to`'concise'` limits the display to the stack frame
  // information most likely to be relevant, eliminating distracting frames
  // such as those from the infrastructure. However, the bug you're trying to
  // track down might be in the infrastrure, in which case the `'verbose'` setting
  // is useful. See
  // [`stackFiltering` options](https://github.com/Agoric/SES-shim/blob/master/packages/ses/lockdown-options.md#stackfiltering-options)
  // for an explanation.
  options = /** @type {LockdownOptions} */ ({ ...firstOptions, ...options });

  const {
    getEnvironmentOption: getenv,
    getCapturedEnvironmentOptionNames,
  } = makeEnvironmentCaptor(globalThis);

  const {
    errorTaming = getenv('LOCKDOWN_ERROR_TAMING', 'safe'),
    errorTrapping = getenv('LOCKDOWN_ERROR_TRAPPING', 'platform'),
    regExpTaming = getenv('LOCKDOWN_REGEXP_TAMING', 'safe'),
    localeTaming = getenv('LOCKDOWN_LOCALE_TAMING', 'safe'),
    consoleTaming = getenv('LOCKDOWN_CONSOLE_TAMING', 'safe'),
    overrideTaming = getenv('LOCKDOWN_OVERRIDE_TAMING', 'moderate'),
    stackFiltering = getenv('LOCKDOWN_STACK_FILTERING', 'concise'),
    // TODO domainTaming should change to safe-by-default in the next breaking relase.
    domainTaming = getenv('LOCKDOWN_DOMAIN_TAMING', 'unsafe'),
    overrideDebug = arrayFilter(
      stringSplit(getenv('LOCKDOWN_OVERRIDE_DEBUG', ''), ','),
      /** @param {string} debugName */
      debugName => debugName !== '',
    ),
    __allowUnsafeMonkeyPatching__ = getenv(
      '__LOCKDOWN_ALLOW_UNSAFE_MONKEY_PATCHING__',
      'safe',
    ),
    dateTaming = 'safe', // deprecated
    mathTaming = 'safe', // deprecated
    ...extraOptions
  } = options;

  const capturedEnvironmentOptionNames = getCapturedEnvironmentOptionNames();
  if (capturedEnvironmentOptionNames.length > 0) {
    // eslint-disable-next-line @endo/no-polymorphic-call
    console.warn(
      `SES Lockdown using options from environment variables ${enJoin(
        arrayMap(capturedEnvironmentOptionNames, q),
        'and',
      )}`,
    );
  }

  // Assert that only supported options were passed.
  // Use Reflect.ownKeys to reject symbol-named properties as well.
  const extraOptionsNames = ownKeys(extraOptions);
  assert(
    extraOptionsNames.length === 0,
    d`lockdown(): non supported option ${q(extraOptionsNames)}`,
  );

  // Asserts for multiple invocation of lockdown().
  if (firstOptions) {
    for (const name of keys(firstOptions)) {
      assert(
        options[name] === firstOptions[name],
        d`lockdown(): cannot re-invoke with different option ${q(name)}`,
      );
    }
    return alreadyHardenedIntrinsics;
  }

  firstOptions = {
    dateTaming, // deprecated
    errorTaming,
    mathTaming, // deprecated
    regExpTaming,
    localeTaming,
    consoleTaming,
    overrideTaming,
    overrideDebug,
    stackFiltering,
    domainTaming,
    __allowUnsafeMonkeyPatching__,
  };

  /**
   * Because of packagers and bundlers, etc, multiple invocations of lockdown
   * might happen in separate instantiations of the source of this module.
   * In that case, each one sees its own `firstOptions` variable, so the test
   * above will not detect that lockdown has already happened. Instead, we
   * unreliably test some telltale signs that lockdown has run, to avoid
   * trying to lock down a locked down environment. Although the test is
   * unreliable, this is consistent with the SES threat model. SES provides
   * security only if it runs first in a given realm, or if everything that
   * runs before it is SES-aware and cooperative. Neither SES nor anything
   * can protect itself from corrupting code that runs first. For these
   * purposes, code that turns a realm into something that passes these
   * tests without actually locking down counts as corrupting code.
   *
   * The specifics of what this tests for may change over time, but it
   * should be consistent with any setting of the lockdown options. We
   * do no checking that the state is consistent with current lockdown
   * options. So a call to lockdown with one set of options may silently
   * succeed with a state not reflecting those options, but only
   * if a previous lockdown happened from something other than this
   * instance of this module.
   */
  const seemsToBeLockedDown = () => {
    return (
      globalThis.Function.prototype.constructor !== globalThis.Function &&
      typeof globalThis.harden === 'function' &&
      typeof globalThis.lockdown === 'function' &&
      globalThis.Date.prototype.constructor !== globalThis.Date &&
      typeof globalThis.Date.now === 'function' &&
      // @ts-ignore
      // eslint-disable-next-line @endo/no-polymorphic-call
      is(globalThis.Date.prototype.constructor.now(), NaN)
    );
  };

  if (seemsToBeLockedDown()) {
    // eslint-disable-next-line @endo/no-polymorphic-call
    console.log('Seems to already be locked down. Skipping second lockdown');
    return alreadyHardenedIntrinsics;
  }

  /**
   * 1. TAME powers & gather intrinsics first.
   */

  tameDomains(domainTaming);

  const {
    addIntrinsics,
    completePrototypes,
    finalIntrinsics,
  } = makeIntrinsicsCollector();

  addIntrinsics({ harden });

  addIntrinsics(tameFunctionConstructors());

  addIntrinsics(tameDateConstructor(dateTaming));
  addIntrinsics(tameErrorConstructor(errorTaming, stackFiltering));
  addIntrinsics(tameMathObject(mathTaming));
  addIntrinsics(tameRegExpConstructor(regExpTaming));

  addIntrinsics(getAnonymousIntrinsics());

  completePrototypes();

  const intrinsics = finalIntrinsics();

  // Wrap console unless suppressed.
  // At the moment, the console is considered a host power in the start
  // compartment, and not a primordial. Hence it is absent from the whilelist
  // and bypasses the intrinsicsCollector.
  let optGetStackString;
  if (errorTaming !== 'unsafe') {
    optGetStackString = intrinsics['%InitialGetStackString%'];
  }
  const consoleRecord = tameConsole(
    // @ts-ignore tameConsole does its own input validation
    consoleTaming,
    errorTrapping,
    optGetStackString,
  );
  globalThis.console = /** @type {Console} */ (consoleRecord.console);

  if (errorTaming === 'unsafe' && globalThis.assert === assert) {
    // If errorTaming is 'unsafe' we replace the global assert with
    // one whose `details` template literal tag does not redact
    // unmarked substitution values. IOW, it blabs information that
    // was supposed to be secret from callers, as an aid to debugging
    // at a further cost in safety.
    globalThis.assert = makeAssert(undefined, true);
  }

  // Replace *Locale* methods with their non-locale equivalents
  tameLocaleMethods(intrinsics, localeTaming);

  // Replace Function.prototype.toString with one that recognizes
  // shimmed functions as honorary native functions.
  const markVirtualizedNativeFunction = tameFunctionToString();

  /**
   * 2. WHITELIST to standardize the environment.
   */

  // Remove non-standard properties.
  // All remaining function encountered during whitelisting are
  // branded as honorary native functions.
  whitelistIntrinsics(intrinsics, markVirtualizedNativeFunction);

  // Initialize the powerful initial global, i.e., the global of the
  // start compartment, from the intrinsics.

  setGlobalObjectConstantProperties(globalThis);

  const { safeEvaluate } = makeSafeEvaluator({ globalObject: globalThis });

  setGlobalObjectMutableProperties(globalThis, {
    intrinsics,
    newGlobalPropertyNames: initialGlobalPropertyNames,
    makeCompartmentConstructor,
    safeEvaluate,
    markVirtualizedNativeFunction,
  });

  /**
   * 3. HARDEN to share the intrinsics.
   */

  function hardenIntrinsics() {
    // Circumvent the override mistake.
    // TODO consider moving this to the end of the repair phase, and
    // therefore before vetted shims rather than afterwards. It is not
    // clear yet which is better.
    // @ts-ignore enablePropertyOverrides does its own input validation
    enablePropertyOverrides(intrinsics, overrideTaming, overrideDebug);

    if (__allowUnsafeMonkeyPatching__ !== 'unsafe') {
      // Finally register and optionally freeze all the intrinsics. This
      // must be the operation that modifies the intrinsics.
      harden(intrinsics);
    }

    // Reveal harden after lockdown.
    // Harden is dangerous before lockdown because hardening just
    // about anything will inadvertently render intrinsics irreparable.
    // Also, for modules that must work both before or after lockdown (code
    // that is portable between JS and SES), the existence of harden in global
    // scope signals whether such code should attempt to use harden in the
    // defense of its own API.
    globalThis.harden = harden;

    // Returning `true` indicates that this is a JS to SES transition.
    return true;
  }

  return hardenIntrinsics;
};

/**
 * @param {LockdownOptions} [options]
 */
export const lockdown = (options = {}) => {
  const maybeHardenIntrinsics = repairIntrinsics(options);
  return maybeHardenIntrinsics();
};
