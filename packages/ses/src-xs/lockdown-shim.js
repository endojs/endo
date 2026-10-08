/**
 * @module Alters the XS implementation of Lockdown to be backward compatible
 * with SES, providing Compartment constructors in every Compartment that can
 * be used with either native ModuleSources or module sources pre-compiled for
 * the SES Compartment, depending on the __native__ Compartment constructor
 * option.
 */
import { globalThis } from '../src/commons.js';
import { NativeStartCompartment } from './commons.js';
import { repairIntrinsics } from '../src/lockdown.js';
import { makeCompartmentConstructor } from '../src/compartment.js';
import { adaptCompartmentConstructors } from './compartment.js';

const lockdown = options => {
  // The shim Compartment constructor must be made from the lockdown
  // intrinsics, as on other engines, rather than reuse the one made when SES
  // was imported, which sampled the then-untamed globals.
  // Sampling the start compartment's global object after lockdown would not
  // do either, since it holds the powerful %Initial*% intrinsics where new
  // compartments must receive the tamed %Shared*% ones.
  // The prototype methods (`shimEvaluate`, `shimImport`, ...) still come from
  // the import-time constructor in `./compartment.js`; they apply to
  // compartments from this constructor through the module-level
  // `privateFields` WeakMap in `../src/compartment.js`.
  /** @type {ReturnType<typeof makeCompartmentConstructor> | undefined} */
  let LockdownShimStartCompartment;
  const hardenIntrinsics = repairIntrinsics(
    options,
    (intrinsics, markVirtualizedNativeFunction) => {
      LockdownShimStartCompartment = makeCompartmentConstructor(
        makeCompartmentConstructor,
        intrinsics,
        markVirtualizedNativeFunction,
      );
    },
  );
  hardenIntrinsics();
  // Replace global Compartment with a version that is hardened and hardens
  // transitive child Compartment.
  // @ts-expect-error Incomplete global type on XS.
  globalThis.Compartment = adaptCompartmentConstructors(
    NativeStartCompartment,
    LockdownShimStartCompartment,
    harden,
  );
};

globalThis.lockdown = lockdown;
