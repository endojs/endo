/* eslint-disable */
/**
 * Transitively freeze an object.
 */
import type { Hardener } from '@agoric/make-hardener';
import type {
  ModuleMapHook,
  ImportHook,
  StaticModuleType,
  Compartment
} from './src/types';
import type { Lockdown } from './src/lockdown-shim';
import type { StaticModuleRecord } from './module-shim';

// For scripts.
declare var harden: Hardener;
declare var lockdown: Lockdown;
declare var Compartment : ReturnType<CompartmentConstructor>;
declare var StaticModuleRecord : StaticModuleRecord;
declare var StaticModuleType : StaticModuleType;
declare var RedirectStaticModuleInterface : RedirectStaticModuleInterface;
declare var FinalStaticModuleType : FinalStaticModuleType;
declare var ThirdPartyStaticModuleInterface : ThirdPartyStaticModuleInterface;
declare var Transform : Transform;
declare var ImportHook : ImportHook;
declare var ResolveHook : ResolveHook;
declare var ModuleMapHook : ModuleMapHook;

declare global {
  // For modules.
  var harden: Hardener;
  var lockdown: Lockdown;
  var Compartment : ReturnType<CompartmentConstructor>;
  var StaticModuleRecord : StaticModuleRecord;
  var StaticModuleType : StaticModuleType;
  var RedirectStaticModuleInterface : RedirectStaticModuleInterface;
  var FinalStaticModuleType : FinalStaticModuleType;
  var ThirdPartyStaticModuleInterface : ThirdPartyStaticModuleInterface;
  var Transform : Transform;
  var ImportHook : ImportHook;
  var ResolveHook : ResolveHook;
  var ModuleMapHook : ModuleMapHook;
}
