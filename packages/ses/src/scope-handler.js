/* global globalThis */

import {
  create,
  freeze,
  getOwnPropertyDescriptor,
  getOwnPropertyDescriptors,
  immutableObject,
  objectHasOwnProperty,
  reflectGet,
  reflectSet,
} from './commons.js';
import { assert } from './error/assert.js';

const { details: d, quote: q } = assert;

// The original unsafe untamed eval function, which must not escape.
// Sample at module initialization time, which is before lockdown can
// repair it.  Use it only to build powerless abstractions.
// eslint-disable-next-line no-eval
const FERAL_EVAL = eval;

/**
 * alwaysThrowHandler
 * This is an object that throws if any propery is called. It's used as
 * a proxy handler which throws on any trap called.
 * It's made from a proxy with a get trap that throws. It's safe to
 * create one and share it between all scopeHandlers.
 */
const alwaysThrowHandler = new Proxy(
  immutableObject,
  freeze({
    get(_shadow, prop) {
      assert.fail(
        d`Please report unexpected scope handler trap: ${q(String(prop))}`,
      );
    },
  }),
);

/*
 * createScopeHandler()
 * ScopeHandler manages a Proxy which serves as the global scope for the
 * performEval operation (the Proxy is the argument of a 'with' binding).
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
  localObject = {},
  { sloppyGlobalsMode = false } = {},
) => {
  // This flag allow us to determine if the eval() call is an done by the
  // compartment's code or if it is user-land invocation, so we can react
  // differently.
  let allowNextEvalToBeUnsafe = false;

  const admitOneUnsafeEvalNext = () => {
    allowNextEvalToBeUnsafe = true;
  };

  const resetOneUnsafeEvalNext = () => {
    const wasSet = allowNextEvalToBeUnsafe;
    allowNextEvalToBeUnsafe = false;
    return wasSet;
  };

  // The scope handler's prototype is a proxy that throws if any trap other
  // than get/set/has are run (like getOwnPropertyDescriptors, apply,
  // getPrototypeOf).
  const scopeHandler = freeze(create(alwaysThrowHandler, getOwnPropertyDescriptors({

    get(_shadow, prop) {
      // Rejecting access to symbol-named properties, specifically the
      // well-known Symbol.unscopables property, is necessary for the integrity
      // of SES.  The JavaScript engine will ask the scopeProxy for its
      // Symbol.unscopables and any property named by the corresponding value
      // will pass through the scopeProxy to the powerful `globalThis` of the
      // start compartment.  However, we have two other defenses that ensure
      // that the scope proxy never has a symbol-named property.  For one,
      // symbols cannot be used as lexical names.  This would be sufficient,
      // but the `scopeProxy does leak to contained code.  This description
      // continues in the preamble of the `set` trap.
      if (typeof prop === 'symbol') {
        return undefined;
      }

      // Special treatment for eval. The very first lookup of 'eval' gets the
      // unsafe (real direct) eval, so it will get the lexical scope that uses
      // the 'with' context.
      if (prop === 'eval') {
        // test that it is true rather than merely truthy
        if (allowNextEvalToBeUnsafe === true) {
          // revoke before use
          allowNextEvalToBeUnsafe = false;
          return FERAL_EVAL;
        }
        // fall through
      }

      // Properties of the localObject.
      if (prop in localObject) {
        // Use reflect to defeat accessors that could be present on the
        // localObject object itself as `this`.
        // This is done out of an overabundance of caution, as the SES shim
        // only use the localObject carry globalLexicals and live binding
        // traps.
        // The globalLexicals are captured as a snapshot of what's passed to
        // the Compartment constructor, wherein all accessors and setters are
        // eliminated and the result frozen.
        // The live binding traps do use accessors, and none of those accessors
        // make use of their receiver.
        // Live binding traps provide no avenue for user code to observe the
        // receiver.
        return reflectGet(localObject, prop, globalObject);
      }

      // Properties of the global.
      return reflectGet(globalObject, prop);
    },

    // TODO have has() return true unconditionally,
    // recover by failing to set properties that do not already exist
    // on globalObject
    set(_shadow, prop, value) {
      // If the `has` trap returns `true` for a property, assignment to a free
      // variable inside a `with` block can induce the `set` trap.  Allowing
      // compartmentalized code to set the `Symbol.unscopables` property of the
      // scopeProxy would allow them to access arbitrary names on the unsafe
      // `globalThis` of the start compartment.  Although the symbols cannot be
      // lexically named by compartmentalized code, the `scopeProxy` leaks.  As
      // no symbols are useful for the intended purpose of revealing lexical
      // names to compartmentalized code, the scopeProxy can safely disallow
      // all symbolly-named properties.
      //
      // A compartmentalized program can create a global function that returns
      // `this`.  A weakness of the SES emulation of JavaScript causes such
      // functions to return the scopeProxy when called as methods of the
      // compartment's `globalThis`.  Compartmentalized code can attempt to set
      // Symbol.unscopables, but the `set` trap also prevents this.  So, this
      // guard stands as a second line of defense.
      if (typeof prop === 'symbol') {
        return undefined;
      }

      // Properties of the localObject.
      if (prop in localObject) {
        const desc = getOwnPropertyDescriptor(localObject, prop);
        // We use hasOwnProperty here instead of the 'in' operator in order to
        // behave correctly even when a scope handler is used before lockdown.
        // In this scencario is is possible, even if absurd, to add a 'value'
        // property to the Object.prototype.
        // Compartments use the SES evaluator and can be used without lockdown,
        // as a demonstration of Compartments as a JavaScript module loader.
        if (objectHasOwnProperty(desc, 'value')) {
          // Work around a peculiar behavior in the specs, where
          // value properties are defined on the receiver.
          return reflectSet(localObject, prop, value);
        }
        // Ensure that the 'this' value on setters resolves
        // to the safeGlobal, not to the localObject object.
        return reflectSet(localObject, prop, value, globalObject);
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
      // TODO always return true and throw on attempts to set properties of
      // globalThis that are not already present, unless sloppyGlobalsMode.
      // As written, typeof XXX in a compartment reveals whether globalThis has
      // that property.
      // Leaving this code as-is produces a danger that we would be tempted to
      // optimize the order for short-circuiting in the common case, and if
      // `globalObject` were elevated above `eval`, an attacker would be able
      // to set the prototype of `globalThis` to a proxy and that proxy could
      // trap `get` such that it could interleave a call to `eval` before the
      // evaluator had an opportunity to reset `allowNextEvalToBeUnsafe`,
      // thereby gaining access to the unsafe `eval`.
      return (
        sloppyGlobalsMode ||
        prop === 'eval' ||
        prop in localObject ||
        prop in globalObject ||
        prop in globalThis // Y? typeof vs ReferenceError
      );
    },

    // note: this is likely a bug of safari
    // https://bugs.webkit.org/show_bug.cgi?id=195534
    // TODO: comment^ (fixed in Safari/JSC 13) whether introducing return null
    // could cause any condition that we should worry about. seems no and has
    // since been fixed, in which case we could just remove the special case.
    // engine causes a trap that's not expected.
    // only ever called Safari 13
    // would always throw otherwise

    getPrototypeOf() {
      return null;
    },

    // Chip has seen this happen single stepping under the Chrome/v8 debugger.
    // TODO record how to reliably reproduce, and to test if this fix helps.
    // TODO report as bug to v8 or Chrome, and record issue link here.

    // TODO?
    // if you don't have this trap you can get access to the meter, given that we leak the scope proxy.
    // if you don't have this method, it would fall through to always throw handler
    // who calls?
    // the V8 debugger
    getOwnPropertyDescriptor(_target, prop) {
      // Coerce with `String` in case prop is a symbol.
      // TODO q instead of JSON.stringify
      const quotedProp = JSON.stringify(String(prop));
      console.warn(
        `getOwnPropertyDescriptor trap on scopeHandler for ${quotedProp}`,
        new Error().stack,
      );
      return undefined;
    },
  })));

  return {
    admitOneUnsafeEvalNext,
    resetOneUnsafeEvalNext,
    scopeHandler,
  };
};
