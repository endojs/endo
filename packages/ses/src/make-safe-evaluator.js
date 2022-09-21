// Portions adapted from V8 - Copyright 2016 the V8 project authors.
// https://github.com/v8/v8/blob/master/src/builtins/builtins-function.cc

import {
  FERAL_EVAL,
  Proxy,
  String,
  TypeError,
  WeakSet,
  apply,
  create,
  defineProperties,
  freeze,
  getOwnPropertyDescriptor,
  getOwnPropertyDescriptors,
  globalThis,
  immutableObject,
  objectHasOwnProperty,
  proxyRevocable,
  reflectGet,
  reflectSet,
  weaksetAdd,
} from './commons.js';
import { getScopeConstants } from './scope-constants.js';
import { applyTransforms, mandatoryTransforms } from './transforms.js';
import { makeEvaluateFactory } from './make-evaluate-factory.js';
import { assert } from './error/assert.js';

const { details: d, quote: q } = assert;

/**
 * alwaysThrowHandler
 * This is an object that throws if any property is called. It's used as
 * a proxy handler which throws on any trap called.
 * It's made from a proxy with a get trap that throws. It's safe to
 * create one and share it between all scopeHandlers.
 */
const alwaysThrowHandler = new Proxy(
  immutableObject,
  freeze({
    get(_shadow, prop) {
      // eslint-disable-next-line @endo/no-polymorphic-call
      assert.fail(
        d`Please report unexpected scope handler trap: ${q(String(prop))}`,
      );
    },
  }),
);

/**
 * makeSafeEvaluator()
 * Build the low-level operation used by all evaluators:
 * eval(), Function(), Compartment.prototype.evaluate().
 *
 * @param {Object} options
 * @param {Object} options.globalObject
 * @param {Object} [options.globalLexicals]
 * @param {Array<Transform>} [options.globalTransforms]
 * @param {bool} [options.sloppyGlobalsMode]
 * @param {WeakSet} [options.knownScopeProxies]
 */
export const makeSafeEvaluator = ({
  globalObject,
  globalLexicals = {},
  globalTransforms = [],
  sloppyGlobalsMode = false,
  knownScopeProxies = new WeakSet(),
} = {}) => {

  /* ScopeHandler manages a Proxy which serves as the global scope for the
   * safeEvaluate operation (the Proxy is the argument of a 'with' binding).
   * As described in createSafeEvaluator(), it has several functions:
   * - allow the very first (and only the very first) use of 'eval' to map to
   * the real (unsafe) eval function, so it acts as a 'direct eval' and can
   * access its lexical scope (which maps to the 'with' binding, which the
   * ScopeHandler also controls).
   * - ensure that all subsequent uses of 'eval' map to the safeEvaluator,
   * which lives as the 'eval' property of the safeGlobal.
   * - route all other property lookups at the safeGlobal.
   * - hide the unsafeGlobal which lives on the scope chain above the 'with'.
   * - ensure the Proxy invariants despite some global properties being frozen.
   */

  const scopeProxyHandlerProperties = {
    get(_shadow, prop) {
      if (typeof prop === 'symbol') {
        return undefined;
      }

      // Properties of the globalLexicals.
      if (prop in globalLexicals) {
        // Use reflect to defeat accessors that could be present on the
        // globalLexicals object itself as `this`.
        // This is done out of an overabundance of caution, as the SES shim
        // only use the globalLexicals carry globalLexicals and live binding
        // traps.
        // The globalLexicals are captured as a snapshot of what's passed to
        // the Compartment constructor, wherein all accessors and setters are
        // eliminated and the result frozen.
        // The live binding traps do use accessors, and none of those accessors
        // make use of their receiver.
        // Live binding traps provide no avenue for user code to observe the
        // receiver.
        return reflectGet(globalLexicals, prop, globalObject);
      }

      // Properties of the global.
      return reflectGet(globalObject, prop);
    },

    set(_shadow, prop, value) {
      // Properties of the globalLexicals.
      if (prop in globalLexicals) {
        const desc = getOwnPropertyDescriptor(globalLexicals, prop);
        if (objectHasOwnProperty(desc, 'value')) {
          // Work around a peculiar behavior in the specs, where
          // value properties are defined on the receiver.
          return reflectSet(globalLexicals, prop, value);
        }
        // Ensure that the 'this' value on setters resolves
        // to the safeGlobal, not to the globalLexicals object.
        return reflectSet(globalLexicals, prop, value, globalObject);
      }

      // Properties of the global.
      return reflectSet(globalObject, prop, value);
    },

    // we need has() to return false for some names to prevent the lookup from
    // climbing the scope chain and eventually reaching the unsafeGlobal
    // object (globalThis), which is bad.

    // todo: we'd like to just have has() return true for everything, and then
    // use get() to raise a ReferenceError for anything not on the safe global.
    // But we want to be compatible with ReferenceError in the normal case and
    // the lack of ReferenceError in the 'typeof' case. Must either reliably
    // distinguish these two cases (the trap behavior might be different), or
    // we rely on a mandatory source-to-source transform to change 'typeof abc'
    // to XXX. We already need a mandatory parse to prevent the 'import',
    // since it's a special form instead of merely being a global variable/

    // note: if we make has() return true always, then we must implement a
    // set() trap to avoid subverting the protection of strict mode (it would
    // accept assignments to undefined globals, when it ought to throw
    // ReferenceError for such assignments)

    has(_shadow, prop) {
      // unsafeGlobal: hide all properties of the current global
      // at the expense of 'typeof' being wrong for those properties. For
      // example, in the browser, evaluating 'document = 3', will add
      // a property to globalObject instead of throwing a ReferenceError.

      return (
        sloppyGlobalsMode ||
        prop in globalLexicals ||
        prop in globalObject ||
        prop in globalThis
      );
    },

    // note: this is likely a bug of safari
    // https://bugs.webkit.org/show_bug.cgi?id=195534

    getPrototypeOf() {
      return null;
    },

    // Chip has seen this happen single stepping under the Chrome/v8 debugger.
    // TODO record how to reliably reproduce, and to test if this fix helps.
    // TODO report as bug to v8 or Chrome, and record issue link here.

    getOwnPropertyDescriptor(_target, prop) {
      // Coerce with `String` in case prop is a symbol.
      const quotedProp = q(String(prop));
      // eslint-disable-next-line @endo/no-polymorphic-call
      console.warn(
        `getOwnPropertyDescriptor trap on scopeHandler for ${quotedProp}`,
        new TypeError().stack,
      );
      return undefined;
    },
  };

  // The scope handler's prototype is a proxy that throws if any trap other
  // than get/set/has are run (like getOwnPropertyDescriptors, apply,
  // getPrototypeOf).
  const scopeHandler = freeze(
    create(
      alwaysThrowHandler,
      getOwnPropertyDescriptors(scopeProxyHandlerProperties),
    ),
  );

  const oneTimeEvalProperties = freeze({
    eval: {
      get() {
        delete evalScope.eval;
        return FERAL_EVAL;
      },
      enumerable: false,
      configurable: true,
    },
  });

  const { proxy: scopeProxy, revoke: revokeScopeProxy } = proxyRevocable(
    immutableObject,
    scopeHandler,
  );
  weaksetAdd(knownScopeProxies, scopeProxy);

  const evalScope = create(null);

  // Defer creating the actual evaluator to first use.
  // Creating a compartment should be possible in no-eval environments
  // It also allows more global constants to be captured by the optimizer
  let evaluate;
  const makeEvaluate = () => {
    if (!evaluate) {
      const constants = getScopeConstants(globalObject, globalLexicals);
      const evaluateFactory = makeEvaluateFactory(constants);
      evaluate = apply(evaluateFactory, { scopeProxy, evalScope }, []);
    }
  };

  /**
   * @param {string} source
   * @param {Object} [options]
   * @param {Array<Transform>} [options.localTransforms]
   */
  const safeEvaluate = (source, { localTransforms = [] } = {}) => {
    makeEvaluate();

    // Execute the mandatory transforms last to ensure that any rewritten code
    // meets those mandatory requirements.
    source = applyTransforms(source, [
      ...localTransforms,
      ...globalTransforms,
      mandatoryTransforms,
    ]);

    // Allow next reference to eval produce the unsafe FERAL_EVAL.
    // We avoid defineProperty because it consumes an extra stack frame taming
    // its return value.
    defineProperties(evalScope, oneTimeEvalProperties);
    let err;
    try {
      // Ensure that "this" resolves to the safe global.
      return apply(evaluate, globalObject, [source]);
    } catch (e) {
      // stash the child-code error in hopes of debugging the internal failure
      err = e;
      throw e;
    } finally {
      if ('eval' in evalScope) {
        delete evalScope.eval;
        // Barring a defect in the SES shim, the scope proxy should allow the
        // powerful, unsafe  `eval` to be used by `evaluate` exactly once, as the
        // very first name that it attempts to access from the lexical scope.
        // A defect in the SES shim could throw an exception after our call to
        // check of evalScope.eval and before `evaluate` calls `eval`
        // internally.
        // If we get here, SES is very broken.
        // This condition is one where this vat is now hopelessly confused, and
        // the vat as a whole should be aborted.
        // No further code should run.
        // All immediately reachable state should be abandoned.
        // However, that is not yet possible, so we at least prevent further
        // variable resolution via the scopeHandler, and throw an error with
        // diagnostic info including the thrown error if any from evaluating the
        // source code.
        revokeScopeProxy();
        // TODO A GOOD PLACE TO PANIC(), i.e., kill the vat incarnation.
        // See https://github.com/Agoric/SES-shim/issues/490
        // eslint-disable-next-line @endo/no-polymorphic-call
        assert.fail(d`handler did not delete unsafe eval from evalScope ${err}`);
      }
    }
  };

  // The functions admitOneUnsafeEvalNext and resetOneUnsafeEvalNext are test
  // fixtures that must not be used internally to communicate between safe eval
  // and scope handler because of the possibility that client code might induce
  // a stack overflow RangeError to prevent the bit from being cleared, and
  // thereby gain access to the unsafe FERAL_EVAL on the next lexical lookup in
  // their own code.
  const admitOneUnsafeEvalNext = () => {
    defineProperties(evalScope, oneTimeEvalProperties);
  };
  const resetOneUnsafeEvalNext = () => {
    const wasSet = 'eval' in evalScope;
    delete evalScope.eval;
    return wasSet;
  };

  // We return the scopeHandler, scopeProxy, and evalScope for tests.
  return { safeEvaluate, scopeHandler, scopeProxy, evalScope, resetOneUnsafeEvalNext, admitOneUnsafeEvalNext };
};
