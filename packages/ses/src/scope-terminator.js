import {
  Proxy,
  String,
  TypeError,
  create,
  freeze,
  getOwnPropertyDescriptors,
  globalThis,
  immutableObject,
  reflectSet,
} from './commons.js';
import { assert } from './error/assert.js';

const { details: d, quote: q } = assert;

/**
 * alwaysThrowHandler
 * This is an object that throws if any property is called. It's used as
 * a proxy handler which throws on any trap called.
 * It's made from a proxy with a get trap that throws. It's safe to
 * create one and share it between all Proxy handlers.
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
 * createScopeTerminator()
 * scopeTerminatorHandler manages a scopeTerminator Proxy which serves as
 * the final scope boundary that will always return "undefined" in order
 * to prevent access to "start compartment globals". When "sloppyGlobalsMode"
 * is true, the Proxy will perform sets on the "globalObject".
 */
export const createScopeTerminator = (
  globalObject,
  { sloppyGlobalsMode = false } = {},
) => {
  const scopeProxyHandlerProperties = {
    get(_shadow, _prop) {
      return undefined;
    },

    set(_shadow, prop, value) {
      if (sloppyGlobalsMode) {
        // Redirect set properties to the globalObject.
        return reflectSet(globalObject, prop, value);
      } else {
        return false;
      }
    },

    has(_shadow, prop) {
      return sloppyGlobalsMode || prop in globalThis;
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
        `getOwnPropertyDescriptor trap on scopeTerminatorHandler for ${quotedProp}`,
        new TypeError().stack,
      );
      return undefined;
    },
  };

  // The scope handler's prototype is a proxy that throws if any trap other
  // than get/set/has are run (like getOwnPropertyDescriptors, apply,
  // getPrototypeOf).
  const scopeTerminatorHandler = freeze(
    create(
      alwaysThrowHandler,
      getOwnPropertyDescriptors(scopeProxyHandlerProperties),
    ),
  );

  const scopeTerminator = new Proxy(immutableObject, scopeTerminatorHandler);

  return {
    scopeTerminatorHandler,
    scopeTerminator,
  };
};
