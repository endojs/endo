/**
 * Transitively freeze an object.
 */
import type { Hardener } from '@agoric/make-hardener';
import { makeLockdown } from './src/lockdown-shim.js';
import { makeCompartmentConstructor } from './src/compartment-shim.js';

namespace global {
  declare let harden : Hardener<T>;
  declare let lockdown : ReturnType<makeLockdown>;
  declare let Compartment : ReturnType<makeCompartmentConstructor>;
}
