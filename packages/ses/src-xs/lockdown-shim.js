/**
 * @module Alters the XS implementation of Lockdown to be backward compatible
 * with SES, providing Compartment constructors in every Compartment that can
 * be used with either native ModuleSources or module sources pre-compiled for
 * the SES Compartment, depending on the __native__ Compartment constructor
 * option.
 */
import { freeze, globalThis } from '../src/commons.js';
import { NativeStartCompartment } from './commons.js';
import { repairIntrinsics } from '../src/lockdown.js';
import { makeCompartmentConstructor } from '../src/compartment.js';
import { adaptCompartmentConstructors } from './compartment.js';

const lockdown = options => {
  // Build from lockdown's %Shared*% intrinsics, not the import-time snapshot
  // or the start compartment's powerful %Initial*% intrinsics. The
  // `globalThis.Compartment` that `repairIntrinsics` installs enforces `new`,
  // but `adaptCompartmentConstructors` invokes this shim constructor as a
  // function, so the adapter needs its own. Its prototype methods share the
  // module-private state used by every shim compartment.
  // `repairIntrinsics` calls `onIntrinsics` synchronously before returning, so
  // the binding is assigned by the time the adapter reads it.
  /** @type {ReturnType<typeof makeCompartmentConstructor> | undefined} */
  let LockdownShimStartCompartment;
  const hardenIntrinsics = repairIntrinsics(
    options,
    (intrinsics, markVirtualizedNativeFunction) => {
      LockdownShimStartCompartment = freeze(
        makeCompartmentConstructor(
          makeCompartmentConstructor,
          intrinsics,
          markVirtualizedNativeFunction,
        ),
      );
      markVirtualizedNativeFunction(LockdownShimStartCompartment);
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
