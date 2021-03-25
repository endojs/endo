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

import makeHardener from '@agoric/make-hardener';
import { keys } from './commons.js';
import { makeIntrinsicsCollector } from './intrinsics.js';
import whitelistIntrinsics from './whitelist-intrinsics.js';
import tameFunctionConstructors from './tame-function-constructors.js';
import tameDateConstructor from './tame-date-constructor.js';
import tameMathObject from './tame-math-object.js';
import tameRegExpConstructor from './tame-regexp-constructor.js';
import enablePropertyOverrides from './enable-property-overrides.js';
import tameLocaleMethods from './tame-locale-methods.js';
import { initGlobalObject } from './global-object.js';
import { initialGlobalPropertyNames } from './whitelist.js';
import { tameFunctionToString } from './tame-function-tostring.js';

import { tameConsole } from './error/tame-console.js';
import tameErrorConstructor from './error/tame-error-constructor.js';
import { assert, makeAssert } from './error/assert.js';

/**
 * @typedef {{
 *   dateTaming?: 'safe' | 'unsafe',
 *   errorTaming?: 'safe' | 'unsafe',
 *   mathTaming?: 'safe' | 'unsafe',
 *   regExpTaming?: 'safe' | 'unsafe',
 *   localeTaming?: 'safe' | 'unsafe',
 *   consoleTaming?: 'safe' | 'unsafe',
 *   overrideTaming?: 'min' | 'moderate' | 'severe',
 *   stackFiltering?: 'concise' | 'verbose',
 * }} LockdownOptions
 */

const { details: d, quote: q } = assert;

let firstOptions;

// A successful lockdown call indicates that `harden` can be called and
// guarantee that the hardened object graph is frozen out to the fringe.
let lockedDown = false;

// Build a harden() with an empty fringe.
// Gate it on lockdown.
const lockdownHarden = makeHardener();

/**
 * @template T
 * @param {T} ref
 * @returns {T}
 */
export const harden = ref => {
  assert(lockedDown, 'Cannot harden before lockdown');
  return lockdownHarden(ref);
};

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

/**
 * @callback CompartmentConstructorMaker
 * @param {CompartmentConstructorMaker} targetMakeCompartmentConstructor
 * @param {Object} intrinsics
 * @param {(func: Function) => void} nativeBrander
 * @returns {CompartmentConstructor}
 */

/**
 * @param {CompartmentConstructorMaker} makeCompartmentConstructor
 * @param {Object} compartmentPrototype
 * @param {() => Object} getAnonymousIntrinsics
 * @param {LockdownOptions} [options]
 * @returns {() => {}} repairIntrinsics
 */
export function repairIntrinsics(
  makeCompartmentConstructor,
  compartmentPrototype,
  getAnonymousIntrinsics,
  options = {},
) {
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
    dateTaming = 'safe',
    errorTaming = 'safe',
    mathTaming = 'safe',
    regExpTaming = 'safe',
    localeTaming = 'safe',
    consoleTaming = 'safe',
    overrideTaming = 'moderate',
    stackFiltering = 'concise',

    ...extraOptions
  } = options;

  // Assert that only supported options were passed.
  // Use Reflect.ownKeys to reject symbol-named properties as well.
  const extraOptionsNames = Reflect.ownKeys(extraOptions);
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
    dateTaming,
    errorTaming,
    mathTaming,
    regExpTaming,
    localeTaming,
    consoleTaming,
    overrideTaming,
    stackFiltering,
  };

  /**
   * 1. TAME powers & gather intrinsics first.
   */
  const intrinsicsCollector = makeIntrinsicsCollector();

  intrinsicsCollector.addIntrinsics(tameFunctionConstructors());

  intrinsicsCollector.addIntrinsics(tameDateConstructor(dateTaming));
  intrinsicsCollector.addIntrinsics(
    tameErrorConstructor(errorTaming, stackFiltering),
  );
  intrinsicsCollector.addIntrinsics(tameMathObject(mathTaming));
  intrinsicsCollector.addIntrinsics(tameRegExpConstructor(regExpTaming));

  intrinsicsCollector.addIntrinsics(getAnonymousIntrinsics());

  intrinsicsCollector.completePrototypes();

  const intrinsics = intrinsicsCollector.finalIntrinsics();

  // Wrap console unless suppressed.
  // At the moment, the console is considered a host power in the start
  // compartment, and not a primordial. Hence it is absent from the whilelist
  // and bypasses the intrinsicsCollector.
  let optGetStackString;
  if (errorTaming !== 'unsafe') {
    optGetStackString = intrinsics['%InitialGetStackString%'];
  }
  const consoleRecord = tameConsole(consoleTaming, optGetStackString);
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
  const nativeBrander = tameFunctionToString();

  /**
   * 2. WHITELIST to standardize the environment.
   */

  // Remove non-standard properties.
  // All remaining function encountered during whitelisting are
  // branded as honorary native functions.
  whitelistIntrinsics(intrinsics, nativeBrander);

  // Initialize the powerful initial global, i.e., the global of the
  // start compartment, from the intrinsics.
  initGlobalObject(
    globalThis,
    intrinsics,
    initialGlobalPropertyNames,
    makeCompartmentConstructor,
    compartmentPrototype,
    {
      nativeBrander,
    },
  );

  /**
   * 3. HARDEN to share the intrinsics.
   */

  function hardenIntrinsics() {
    // Circumvent the override mistake.
    enablePropertyOverrides(intrinsics, overrideTaming);

    // Finally register and optionally freeze all the intrinsics. This
    // must be the operation that modifies the intrinsics.
    lockdownHarden(intrinsics);

    // Having completed lockdown without failing, the user may now
    // call `harden` and expect the object's transitively accessible properties
    // to be frozen out to the fringe.
    // Raise the `harden` gate.
    lockedDown = true;

    // Returning `true` indicates that this is a JS to SES transition.
    return true;
  }

  return hardenIntrinsics;
}

/**
 * @param {CompartmentConstructorMaker} makeCompartmentConstructor
 * @param {Object} compartmentPrototype
 * @param {() => Object} getAnonymousIntrinsics
 */
export const makeLockdown = (
  makeCompartmentConstructor,
  compartmentPrototype,
  getAnonymousIntrinsics,
) => {
  /**
   * @param {LockdownOptions} [options]
   */
  const lockdown = (options = {}) => {
    const maybeHardenIntrinsics = repairIntrinsics(
      makeCompartmentConstructor,
      compartmentPrototype,
      getAnonymousIntrinsics,
      options,
    );
    return maybeHardenIntrinsics();
  };
  return lockdown;
};

/** @typedef {ReturnType<typeof makeLockdown>} Lockdown */
