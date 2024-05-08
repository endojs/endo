/**
 * @module In the spirit of ../src/commons.js, this module captures native
 * functions specific to the XS engine during initialization, so vetted shims
 * are free to modify any intrinsic without risking the integrity of SES.
 */

import {
  getOwnPropertyDescriptor,
  globalThis,
  uncurryThis,
} from '../src/commons.js';

export const NativeStartCompartment = globalThis.Compartment;
export const nativeCompartmentPrototype = NativeStartCompartment.prototype;
export const nativeImport = uncurryThis(nativeCompartmentPrototype.import);
export const nativeImportNow = uncurryThis(
  nativeCompartmentPrototype.importNow,
);
export const nativeEvaluate = uncurryThis(nativeCompartmentPrototype.evaluate);
export const nativeGetGlobalThis = uncurryThis(
  getOwnPropertyDescriptor(nativeCompartmentPrototype, 'globalThis').get,
);
