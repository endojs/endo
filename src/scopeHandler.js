import { throwTantrum } from './assertions';
import {
  getOwnPropertyDescriptor,
  immutableObject,
  reflectGet,
  reflectSet,
} from './commons';

/**
 * alwaysThrowHandler
 * This is an object that throws if any propery is called. It's used as
 * a proxy handler which throws on any trap called.
 * It's made from a proxy with a get trap that throws. It's safe to
 * create one and share it between all scopeHandlers.
 */
const alwaysThrowHandler = new Proxy(immutableObject, {
  get(shadow, prop) {
    throwTantrum(`unexpected scope handler trap called: ${String(prop)}`);
  },
});

/**
 * createScopeHandler()
 * ScopeHandler manages a Proxy which serves as the global scope for the
 * performEvaluator operation (the Proxy is the argument of a 'with' binding).
 * As described in createSafeEvaluator(), it has several functions:
 * - allow the very first (and only the very first) use of 'eval' to map to
 *   the real (unsafe) eval function, so it acts as a 'direct eval' and can
 *   access its lexical scope (which maps to the 'with' binding, which the
 *   ScopeHandler also controls).
 * - ensure that all subsequent uses of 'eval' map to the safeEvaluator,
 *   which lives as the 'eval' property of the safeGlobal.
 * - route all other property lookups at the safeGlobal.
 * - hide the unsafeGlobal which lives on the scope chain above the 'with'.
 * - ensure the Proxy invariants despite some global properties being frozen.
 */
export function createScopeHandler(
  realmRec,
  globalObject,
  endowments = {},
  { sloppyGlobalsMode = false } = {},
) {
  // Ensure we use the correct global, associated with the inrinsics.
  const unsafeGlobal = realmRec.intrinsics.Function('return this;')();

  return {
    // The scope handler throws if any trap other than get/set/has are run
    // (e.g. getOwnPropertyDescriptors, apply, getPrototypeOf).
    // eslint-disable-next-line no-proto
    __proto__: alwaysThrowHandler,

    // This flag allow us to determine if the eval() call is an done by the
    // realm's code or if it is user-land invocation, so we can react differently.
    useUnsafeEvaluator: false,

    get(shadow, prop) {
      if (typeof prop === 'symbol') {
        return undefined;
      }

      // Special treatment for eval. The very first lookup of 'eval' gets the
      // unsafe (real direct) eval, so it will get the lexical scope that uses
      // the 'with' context.
      if (prop === 'eval') {
        // test that it is true rather than merely truthy
        if (this.useUnsafeEvaluator === true) {
          // revoke before use
          this.useUnsafeEvaluator = false;
          return realmRec.intrinsics.eval;
        }
        // fall through
      }

      // Properties of the global.
      if (prop in endowments) {
        // Use reflect to defeat accessors that could be
        // present on the endowments object itself as `this`.
        return reflectGet(endowments, prop, globalObject);
      }

      // Properties of the global.
      return reflectGet(globalObject, prop);
    },

    // eslint-disable-next-line class-methods-use-this
    set(shadow, prop, value) {
      // Properties of the endowments.
      if (prop in endowments) {
        const desc = getOwnPropertyDescriptor(endowments, prop);
        if ('value' in desc) {
          // Work around a peculiar behavior in the specs, where
          // value properties are defined on the receiver.
          return reflectSet(endowments, prop, value);
        }
        // Ensure that the 'this' value on setters resolves
        // to the safeGlobal, not to the endowments object.
        return reflectSet(endowments, prop, value, globalObject);
      }

      // Properties of the global.
      return reflectSet(globalObject, prop, value);
    },

    // we need has() to return false for some names to prevent the lookup  from
    // climbing the scope chain and eventually reaching the unsafeGlobal
    // object, which is bad.

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

    has(shadow, prop) {
      // unsafeGlobal: hide all properties of the current global
      // at the expense of 'typeof' being wrong for those properties. For
      // example, in the browser, evaluating 'document = 3', will add
      // a property to globalObject instead of throwing a ReferenceError.
      if (
        sloppyGlobalsMode ||
        prop === 'eval' ||
        prop in endowments ||
        prop in globalObject ||
        prop in unsafeGlobal
      ) {
        return true;
      }

      return false;
    },

    // note: this is likely a bug of safari
    // https://bugs.webkit.org/show_bug.cgi?id=195534

    getPrototypeOf() {
      return null;
    },
  };
}
