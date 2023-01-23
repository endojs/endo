import {
  Proxy,
  create,
  freeze,
  getOwnPropertyDescriptors,
  immutableObject,
  reflectSet,
} from './commons.js';
import {
  strictScopeTerminatorHandler,
  alwaysThrowHandler,
} from './strict-scope-terminator.js';

/*
 * createSloppyGlobalsScopeTerminator()
 * strictScopeTerminatorHandler manages a scopeTerminator Proxy which serves as
 * the final scope boundary that will always return "undefined" in order
 * to prevent access to "start compartment globals". When "sloppyGlobalsMode"
 * is true, the Proxy will perform sets on the "globalObject".
 */
export const createSloppyGlobalsScopeTerminator = globalObject => {
  const scopeProxyHandlerProperties = {
    // inherit scopeTerminator behavior
    ...strictScopeTerminatorHandler,

    // Redirect set properties to the globalObject.
    set(_shadow, prop, value) {
      return reflectSet(globalObject, prop, value);
    },

    // Always claim to have a potential property in order to be the recipient of a set
    has(_shadow, _prop) {
      return true;
    },
  };

  // The scope handler's prototype is a proxy that throws if any trap other
  // than get/set/has are run (like getOwnPropertyDescriptors, apply,
  // getPrototypeOf).
  const sloppyGlobalsScopeTerminatorHandler = freeze(
    create(
      alwaysThrowHandler,
      getOwnPropertyDescriptors(scopeProxyHandlerProperties),
    ),
  );

  const sloppyGlobalsScopeTerminator = new Proxy(
    immutableObject,
    sloppyGlobalsScopeTerminatorHandler,
  );

  return sloppyGlobalsScopeTerminator;
};
freeze(createSloppyGlobalsScopeTerminator);
