/* eslint-disable */
/**
 * Transitively freeze an object.
 */
import type { Hardener } from '@agoric/make-hardener';
import type { CompartmentConstructor } from './src/compartment-shim';
import type { Lockdown } from './src/lockdown-shim';

// For scripts.
declare var harden: Hardener;
declare var lockdown: Lockdown;
declare var Compartment: CompartmentConstructor;

declare global {
  // For modules.
  var harden: Hardener;
  var lockdown : Lockdown;
  var Compartment : CompartmentConstructor;
}
