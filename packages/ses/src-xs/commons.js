/**
 * @module In the spirit of ../src/commons.js, this module captures native
 * functions specific to the XS engine during initialization, so vetted shims
 * are free to modify any intrinsic without risking the integrity of SES.
 */

/// <reference types="ses"/>

import {
  getOwnPropertyDescriptor,
  globalThis,
  uncurryThis,
} from '../src/commons.js';

/** @type {typeof Compartment} */
export const NativeStartCompartment = /** @type {any} */ (globalThis)
  .Compartment;
export const nativeCompartmentPrototype = NativeStartCompartment.prototype;
export const nativeImport = uncurryThis(nativeCompartmentPrototype.import);
export const nativeImportNow = uncurryThis(
  nativeCompartmentPrototype.importNow,
);
/** @type {(compartment: any, source: string) => unknown} */
export const nativeEvaluate = uncurryThis(nativeCompartmentPrototype.evaluate);
/** @type {(compartment: typeof Compartment) => typeof globalThis} */
export const nativeGetGlobalThis = uncurryThis(
  // @ts-expect-error we know it is there on XS
  getOwnPropertyDescriptor(nativeCompartmentPrototype, 'globalThis').get,
);
