/**
 * Types required for policy enforcement.
 *
 * @module
 */

/* eslint-disable no-use-before-define */

import type { LiteralUnion, SomeObject } from './typescript.js';

export type PackageNamingKit = {
  /** true if location is the entry compartment */
  isEntry?: boolean | undefined;
  name?: LiteralUnion<'<ATTENUATORS>', string>;
  path: Array<string>;
};

export type Attenuator<
  GlobalParams extends [any, ...any[]] = [any, ...any[]],
  ModuleParams extends [any, ...any[]] = [any, ...any[]],
> = {
  attenuateGlobals?: GlobalAttenuatorFn<GlobalParams> | undefined;
  attenuateModule?:
    | ModuleAttenuatorFn<ModuleParams, SomeObject, SomeObject>
    | undefined;
};

export type GlobalAttenuatorFn<
  Params extends [any, ...any[]] = [any, ...any[]],
> = (
  params: Params,
  originalObject: Record<PropertyKey, any>,
  globalThis: Record<PropertyKey, any>,
) => void;

export type ModuleAttenuatorFn<
  Params extends [any, ...any[]] = [any, ...any[]],
  T = SomeObject,
  U = T,
> = (params: Params, ns: T) => U;

export type DeferredAttenuatorsProvider = {
  import: (attenuatorSpecifier: string | null) => Promise<Attenuator>;
};

/**
 * A fieldname of `PackagePolicy`; used with `policyLookupHelper()`
 */
export type PolicyEnforcementField = 'builtins' | 'globals' | 'packages';
