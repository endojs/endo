import { reflectSet } from './commons.js';
import { makeScopeTerminatorProxy } from './strict-scope-terminator.js';

/**
 * A sloppy scopeTerminator Proxy which serves as the final scope boundary that
 * will perform sets on the "globalObject".
 *
 * @param {object} globalObject
 */
export const createSloppyGlobalsScopeTerminator = globalObject =>
  makeScopeTerminatorProxy({
    // Redirect set properties to the globalObject.
    set(_shadow, prop, value) {
      return reflectSet(globalObject, prop, value);
    },

    // Always claim to have a potential property in order to be the recipient of a set
    has(_shadow, _prop) {
      return true;
    },
  });
