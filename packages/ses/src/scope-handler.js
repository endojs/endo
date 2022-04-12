import {
  FERAL_EVAL,
  Proxy,
  String,
  TypeError,
  create,
  freeze,
  getOwnPropertyDescriptor,
  getOwnPropertyDescriptors,
  globalThis,
  immutableObject,
  objectHasOwnProperty,
  reflectGet,
  reflectSet,
  seal,
} from './commons.js';
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

/*
 * createScopeHandler()
 * ScopeHandler manages a Proxy which serves as the global scope for the
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
export const createScopeHandler = (
  globalObject,
  globalLexicals = {},
  { sloppyGlobalsMode = false } = {},
) => {
  // This flag allow us to determine if the eval() call is an done by the
  // compartment's code or if it is user-land invocation, so we can react
  // differently.
  // Using a flag on an object with a single mutable property allows a safe
  // evaluator to signal to the scope proxy without consuming a stack frame.
  // Consuming a stack frame could possibly allow an attacker to control the
  // stack depth before calling `evaluate` to cause a RangeError before this
  // flag can be reset, leaving the unsafe evaluator available.
  const scopeController = {
    allowNextEvalToBeUnsafe: false,
  };
  seal(scopeController);

  const scopeProxyHandlerProperties = {
    get(_shadow, prop) {
      if (typeof prop === 'symbol') {
        return undefined;
      }

      // Special treatment for eval. The very first lookup of 'eval' gets the
      // unsafe (real direct) eval, so it will get the lexical scope that uses
      // the 'with' context.
      if (prop === 'eval') {
        // test that it is true rather than merely truthy
        if (scopeController.allowNextEvalToBeUnsafe === true) {
          // revoke before use
          scopeController.allowNextEvalToBeUnsafe = false;
          return FERAL_EVAL;
        }
        // fall through
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

      // !!!!!      WARNING: DANGER ZONE      !!!!!!
      // The order of the conditions in the `||` expression below is of the
      // utmost importance. Under no circumstances should `eval` be checked
      // after `globalObject`. The prototype of the global object is under
      // full control of user code and may be replaced by a proxy with a
      // `has` trap. If we allow that trap to trigger while the
      // `allowNextEvalToBeUnsafe` flag is down, it could allow user code
      // to get a hold of `FERAL_EVAL`, resulting in a complete escape of
      // the compartment.
      // !!!!!      WARNING: DANGER ZONE      !!!!!!
      return (
        sloppyGlobalsMode ||
        (scopeController.allowNextEvalToBeUnsafe && prop === 'eval') ||
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

  return {
    scopeController,
    scopeHandler,
  };
};
