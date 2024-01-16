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

import { getEnvironmentOption as getenv } from '@endo/env-options';
import {
  FERAL_FUNCTION,
  FERAL_EVAL,
  TypeError,
  arrayFilter,
  globalThis,
  is,
  ownKeys,
  stringSplit,
  noEvalEvaluate,
  getOwnPropertyNames,
  getPrototypeOf,
} from './commons.js';
import { makeHardener } from './make-hardener.js';
import { makeIntrinsicsCollector } from './intrinsics.js';
import whitelistIntrinsics from './permits-intrinsics.js';
import tameFunctionConstructors from './tame-function-constructors.js';
import tameDateConstructor from './tame-date-constructor.js';
import tameMathObject from './tame-math-object.js';
import tameRegExpConstructor from './tame-regexp-constructor.js';
import enablePropertyOverrides from './enable-property-overrides.js';
import tameLocaleMethods from './tame-locale-methods.js';
import {
  setGlobalObjectConstantProperties,
  setGlobalObjectMutableProperties,
  setGlobalObjectEvaluators,
} from './global-object.js';
import { makeSafeEvaluator } from './make-safe-evaluator.js';
import { initialGlobalPropertyNames } from './permits.js';
import { tameFunctionToString } from './tame-function-tostring.js';
import { tameDomains } from './tame-domains.js';

import { tameConsole } from './error/tame-console.js';
import tameErrorConstructor from './error/tame-error-constructor.js';
import { assert, makeAssert } from './error/assert.js';
import { getAnonymousIntrinsics } from './get-anonymous-intrinsics.js';
import { makeCompartmentConstructor } from './compartment.js';
import { tameHarden } from './tame-harden.js';
import { tameSymbolConstructor } from './tame-symbol-constructor.js';
import { tameFauxDataProperties } from './tame-faux-data-properties.js';

/** @typedef {import('../types.js').LockdownOptions} LockdownOptions */

const { Fail, details: d, quote: q } = assert;

/** @type {Error=} */
let priorRepairIntrinsics;

/** @type {Error=} */
let priorHardenIntrinsics;

// Build a harden() with an empty fringe.
// Gate it on lockdown.
/**
 * @template T
 * @param {T} ref
 * @returns {T}
 */
const safeHarden = makeHardener();

/**
 * @callback Transform
 * @param {string} source
 * @returns {string}
 */

/**
 * @callback CompartmentConstructor
 * @param {object} endowments
 * @param {object} moduleMap
 * @param {object} [options]
 * @param {Array<Transform>} [options.transforms]
 * @param {Array<Transform>} [options.__shimTransforms__]
 */

// TODO https://github.com/endojs/endo/issues/814
// Lockdown currently allows multiple calls provided that the specified options
// of every call agree.  With experience, we have observed that lockdown should
// only ever need to be called once and that simplifying lockdown will improve
// the quality of audits.

const assertDirectEvalAvailable = () => {
  let allowed = false;
  try {
    allowed = FERAL_FUNCTION(
      'eval',
      'SES_changed',
      `\
        eval("SES_changed = true");
        return SES_changed;
      `,
    )(FERAL_EVAL, false);
    // If we get here and SES_changed stayed false, that means the eval was sloppy
    // and indirect, which generally creates a new global.
    // We are going to throw an exception for failing to initialize SES, but
    // good neighbors clean up.
    if (!allowed) {
      delete globalThis.SES_changed;
    }
  } catch (_error) {
    // We reach here if eval is outright forbidden by a Content Security Policy.
    // We allow this for SES usage that delegates the responsibility to isolate
    // guest code to production code generation.
    allowed = true;
  }
  if (!allowed) {
    // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_DIRECT_EVAL.md
    throw TypeError(
      `SES cannot initialize unless 'eval' is the original intrinsic 'eval', suitable for direct-eval (dynamically scoped eval) (SES_DIRECT_EVAL)`,
    );
  }
};

/**
 * @param {LockdownOptions} [options]
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
  // [`stackFiltering` options](https://github.com/Agoric/SES-shim/blob/master/packages/ses/docs/lockdown.md#stackfiltering-options)
  // for an explanation.

  const {
    errorTaming = getenv('LOCKDOWN_ERROR_TAMING', 'safe'),
    errorTrapping = /** @type {"platform" | "none" | "report" | "abort" | "exit" | undefined} */ (
      getenv('LOCKDOWN_ERROR_TRAPPING', 'platform')
    ),
    unhandledRejectionTrapping = /** @type {"none" | "report" | undefined} */ (
      getenv('LOCKDOWN_UNHANDLED_REJECTION_TRAPPING', 'report')
    ),
    regExpTaming = getenv('LOCKDOWN_REGEXP_TAMING', 'safe'),
    localeTaming = getenv('LOCKDOWN_LOCALE_TAMING', 'safe'),

    consoleTaming = /** @type {'unsafe' | 'safe' | undefined} */ (
      getenv('LOCKDOWN_CONSOLE_TAMING', 'safe')
    ),
    overrideTaming = getenv('LOCKDOWN_OVERRIDE_TAMING', 'moderate'),
    stackFiltering = getenv('LOCKDOWN_STACK_FILTERING', 'concise'),
    domainTaming = getenv('LOCKDOWN_DOMAIN_TAMING', 'safe'),
    evalTaming = getenv('LOCKDOWN_EVAL_TAMING', 'safeEval'),
    overrideDebug = arrayFilter(
      stringSplit(getenv('LOCKDOWN_OVERRIDE_DEBUG', ''), ','),
      /** @param {string} debugName */
      debugName => debugName !== '',
    ),
    __hardenTaming__ = getenv('LOCKDOWN_HARDEN_TAMING', 'safe'),
    dateTaming = 'safe', // deprecated
    mathTaming = 'safe', // deprecated
    ...extraOptions
  } = options;

  evalTaming === 'unsafeEval' ||
    evalTaming === 'safeEval' ||
    evalTaming === 'noEval' ||
    Fail`lockdown(): non supported option evalTaming: ${q(evalTaming)}`;

  // Assert that only supported options were passed.
  // Use Reflect.ownKeys to reject symbol-named properties as well.
  const extraOptionsNames = ownKeys(extraOptions);
  extraOptionsNames.length === 0 ||
    Fail`lockdown(): non supported option ${q(extraOptionsNames)}`;

  priorRepairIntrinsics === undefined ||
    // eslint-disable-next-line @endo/no-polymorphic-call
    assert.fail(
      d`Already locked down at ${priorRepairIntrinsics} (SES_ALREADY_LOCKED_DOWN)`,
      TypeError,
    );
  // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_ALREADY_LOCKED_DOWN.md
  priorRepairIntrinsics = TypeError('Prior lockdown (SES_ALREADY_LOCKED_DOWN)');
  // Tease V8 to generate the stack string and release the closures the stack
  // trace retained:
  priorRepairIntrinsics.stack;

  assertDirectEvalAvailable();

  /**
   * Because of packagers and bundlers, etc, multiple invocations of lockdown
   * might happen in separate instantiations of the source of this module.
   * In that case, each one sees its own `firstOptions` variable, so the test
   * above will not detect that lockdown has already happened. We
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
   * should be consistent with any setting of the lockdown options.
   */
  const seemsToBeLockedDown = () => {
    return (
      globalThis.Function.prototype.constructor !== globalThis.Function &&
      // @ts-ignore harden is absent on globalThis type def.
      typeof globalThis.harden === 'function' &&
      // @ts-ignore lockdown is absent on globalThis type def.
      typeof globalThis.lockdown === 'function' &&
      globalThis.Date.prototype.constructor !== globalThis.Date &&
      typeof globalThis.Date.now === 'function' &&
      // @ts-ignore does not recognize that Date constructor is a special
      // Function.
      // eslint-disable-next-line @endo/no-polymorphic-call
      is(globalThis.Date.prototype.constructor.now(), NaN)
    );
  };

  if (seemsToBeLockedDown()) {
    // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_MULTIPLE_INSTANCES.md
    throw TypeError(
      `Already locked down but not by this SES instance (SES_MULTIPLE_INSTANCES)`,
    );
  }

  /**
   * 1. TAME powers & gather intrinsics first.
   */

  tameDomains(domainTaming);

  // Replace Function.prototype.toString with one that recognizes
  // shimmed functions as honorary native functions.
  const markVirtualizedNativeFunction = tameFunctionToString();

  const { addIntrinsics, completePrototypes, finalIntrinsics } =
    makeIntrinsicsCollector();

  const tamedHarden = tameHarden(safeHarden, __hardenTaming__);
  addIntrinsics({ harden: tamedHarden });

  addIntrinsics(tameFunctionConstructors());

  addIntrinsics(tameDateConstructor(dateTaming));
  addIntrinsics(tameErrorConstructor(errorTaming, stackFiltering));
  addIntrinsics(tameMathObject(mathTaming));
  addIntrinsics(tameRegExpConstructor(regExpTaming));
  addIntrinsics(tameSymbolConstructor());

  addIntrinsics(getAnonymousIntrinsics());

  completePrototypes();

  const intrinsics = finalIntrinsics();

  const hostIntrinsics = { __proto__: null };

  // The Node.js Buffer is a derived class of Uint8Array, and as such is often
  // passed around where a Uint8Array is expected.
  if (typeof globalThis.Buffer === 'function') {
    hostIntrinsics.Buffer = globalThis.Buffer;
  }

  /**
   * Wrap console unless suppressed.
   * At the moment, the console is considered a host power in the start
   * compartment, and not a primordial. Hence it is absent from the whilelist
   * and bypasses the intrinsicsCollector.
   *
   * @type {((error: any) => string | undefined) | undefined}
   */
  let optGetStackString;
  if (errorTaming !== 'unsafe') {
    optGetStackString = intrinsics['%InitialGetStackString%'];
  }
  const consoleRecord = tameConsole(
    consoleTaming,
    errorTrapping,
    unhandledRejectionTrapping,
    optGetStackString,
  );
  globalThis.console = /** @type {Console} */ (consoleRecord.console);

  // The untamed Node.js console cannot itself be hardened as it has mutable
  // internal properties, but some of these properties expose internal versions
  // of classes from node's "primordials" concept.
  // eslint-disable-next-line no-underscore-dangle
  if (typeof (/** @type {any} */ (consoleRecord.console)._times) === 'object') {
    // SafeMap is a derived Map class used internally by Node
    // There doesn't seem to be a cleaner way to reach it.
    hostIntrinsics.SafeMap = getPrototypeOf(
      // eslint-disable-next-line no-underscore-dangle
      /** @type {any} */ (consoleRecord.console)._times,
    );
  }

  // @ts-ignore assert is absent on globalThis type def.
  if (errorTaming === 'unsafe' && globalThis.assert === assert) {
    // If errorTaming is 'unsafe' we replace the global assert with
    // one whose `details` template literal tag does not redact
    // unmarked substitution values. IOW, it blabs information that
    // was supposed to be secret from callers, as an aid to debugging
    // at a further cost in safety.
    // @ts-ignore assert is absent on globalThis type def.
    globalThis.assert = makeAssert(undefined, true);
  }

  // Replace *Locale* methods with their non-locale equivalents
  tameLocaleMethods(intrinsics, localeTaming);

  tameFauxDataProperties(intrinsics);

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

  setGlobalObjectMutableProperties(globalThis, {
    intrinsics,
    newGlobalPropertyNames: initialGlobalPropertyNames,
    makeCompartmentConstructor,
    markVirtualizedNativeFunction,
  });

  if (evalTaming === 'noEval') {
    setGlobalObjectEvaluators(
      globalThis,
      noEvalEvaluate,
      markVirtualizedNativeFunction,
    );
  } else if (evalTaming === 'safeEval') {
    const { safeEvaluate } = makeSafeEvaluator({ globalObject: globalThis });
    setGlobalObjectEvaluators(
      globalThis,
      safeEvaluate,
      markVirtualizedNativeFunction,
    );
  } else if (evalTaming === 'unsafeEval') {
    // Leave eval function and Function constructor of the initial compartment in-tact.
    // Other compartments will not have access to these evaluators unless a guest program
    // escapes containment.
  }

  /**
   * 3. HARDEN to share the intrinsics.
   *
   * We define hardenIntrinsics here so that options are in scope, but return
   * it to the caller because we intend to eventually allow vetted shims to run
   * between repairs and the hardening of intrinsics and so we can benchmark
   * repair separately from hardening.
   */

  const hardenIntrinsics = () => {
    priorHardenIntrinsics === undefined ||
      // eslint-disable-next-line @endo/no-polymorphic-call
      assert.fail(
        d`Already locked down at ${priorHardenIntrinsics} (SES_ALREADY_LOCKED_DOWN)`,
        TypeError,
      );
    // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_ALREADY_LOCKED_DOWN.md
    priorHardenIntrinsics = TypeError(
      'Prior lockdown (SES_ALREADY_LOCKED_DOWN)',
    );
    // Tease V8 to generate the stack string and release the closures the stack
    // trace retained:
    priorHardenIntrinsics.stack;

    // Circumvent the override mistake.
    // TODO consider moving this to the end of the repair phase, and
    // therefore before vetted shims rather than afterwards. It is not
    // clear yet which is better.
    // @ts-ignore enablePropertyOverrides does its own input validation
    enablePropertyOverrides(intrinsics, overrideTaming, overrideDebug);

    // Finally register and optionally freeze all the intrinsics. This
    // must be the operation that modifies the intrinsics.
    const toHarden = {
      intrinsics,
      hostIntrinsics,
      globals: {
        // Harden evaluators
        Function: globalThis.Function,
        eval: globalThis.eval,
        // @ts-ignore Compartment does exist on globalThis
        Compartment: globalThis.Compartment,

        // Harden Symbol
        Symbol: globalThis.Symbol,
      },
    };

    // Harden Symbol and properties for initialGlobalPropertyNames in the host realm
    for (const prop of getOwnPropertyNames(initialGlobalPropertyNames)) {
      toHarden.globals[prop] = globalThis[prop];
    }

    tamedHarden(toHarden);

    return tamedHarden;
  };

  return hardenIntrinsics;
};
