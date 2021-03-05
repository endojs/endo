/* eslint-disable */
/**
 * Transitively freeze an object.
 */
import type { Hardener } from '@agoric/make-hardener';
import type { CompartmentConstructor } from './src/compartment-shim';
import type { Lockdown } from './src/lockdown-shim';
import type { StaticModuleRecord } from './module-shim';

// For scripts.
declare var harden: Hardener;
declare var lockdown: Lockdown;
declare var Compartment : ReturnType<CompartmentConstructor>;
declare var StaticModuleRecord : StaticModuleRecord;

declare type StaticModuleType = RedirectStaticModuleInterface | FinalStaticModuleType;
declare interface RedirectStaticModuleInterface {
  readonly record: FinalStaticModuleType,
  specifier: string
};
declare type FinalStaticModuleType = StaticModuleRecord | ThirdPartyModuleInterface;
declare interface ThirdPartyStaticModuleInterface {
  readonly imports: Array<string>,
  readonly execute: (exports: Object) => void,
};

declare type Transform = (source: string) => string;
declare type ImportHook = (moduleSpecifier: string) => Promise<Object>;
declare type ModuleMapHook = (moduleSpecifier: string) => string | Object | void;

declare global {
  // For modules.
  var harden: Hardener;
  var lockdown : Lockdown;
  var Compartment : ReturnType<CompartmentConstructor>;
  var StaticModuleRecord : StaticModuleRecord;

  type StaticModuleType = RedirectStaticModuleInterface | FinalStaticModuleType;
  interface RedirectStaticModuleInterface {
    readonly record: FinalStaticModuleType,
    specifier: string
  };
  type FinalStaticModuleType = StaticModuleRecord | ThirdPartyModuleInterface;
  interface ThirdPartyStaticModuleInterface {
    readonly imports: Array<string>,
    readonly execute: (exports: Object) => void,
  };

  type Transform = (source: string) => string;
  type ImportHook = (moduleSpecifier: string) => Promise<Object>;
  type ModuleMapHook = (moduleSpecifier: string) => string | Object | void;
}
