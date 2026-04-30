/**
 * Describes the portion of a compartment map dedicated to narrowing
 * or attenuating the powers available to each compartment.
 *
 * @module
 */

import type { WILDCARD_POLICY_VALUE } from '../policy-format.js';
import type { IsAny } from './typescript.js';

/* eslint-disable no-use-before-define */

/**
 * An object representing a full attenuation definition.
 */
export type FullAttenuationDefinition = {
  /** The type of attenuation. */
  attenuate: string;
  /** The parameters for the attenuation. */
  params?: ImplicitAttenuationDefinition;
};

/**
 * An array of any type representing an implicit attenuation definition.
 */
export type ImplicitAttenuationDefinition = [any, ...any[]];

/**
 * A type representing an attenuation definition, which can be either a full or
 * implicit definition.
 */
export type AttenuationDefinition =
  | FullAttenuationDefinition
  | ImplicitAttenuationDefinition;

/**
 * Information about the attenuator implementation
 */
export type UnifiedAttenuationDefinition = {
  /** Name of the attenuator (for error messages) */
  displayName: string;
  /** The module specifier of the implementation */
  specifier: string | null;
  /** Parameters to pass to the attenuator at invocation */
  params?: any[] | undefined;
};

/**
 * A type representing a wildcard policy, which can be 'any'.
 */
export type WildcardPolicy = typeof WILDCARD_POLICY_VALUE;

/**
 * A type representing a property policy, which is a record of string keys and
 * boolean values
 */
export type PropertyPolicy = Record<string, boolean>;

/**
 * A type representing a policy item, which can be a {@link WildcardPolicy
 * wildcard policy}, a property policy, `undefined`, or defined by an
 * attenuator
 *
 * @remarks
 * The void-vs-custom `T` branch was originally `[T] extends [void] ? … : …`, but
 * the type `any` also makes that test succeed, so `PolicyItem<any>` used to
 * reduce to the same as `void` and
 * `PackagePolicy<any, any, any, any> = AnyPackagePolicy` was not a supertype of
 * policies with extra string literals (for example, LavaMoat's {@code "root"} on
 * package imports). A separate branch for a wide
 * `any` type parameter yields
 * `PolicyItem<any> = WildcardPolicy | PropertyPolicy | any` so
 * `AnyPackagePolicy` correctly accepts all package policy item shapes.
 */
export type PolicyItem<T = void> =
  IsAny<T> extends true
    ? WildcardPolicy | PropertyPolicy | T
    : [T] extends [void]
      ? WildcardPolicy | PropertyPolicy
      : WildcardPolicy | PropertyPolicy | T;

/**
 * An object representing a nested attenuation definition.
 */
export type NestedAttenuationDefinition = Record<
  string,
  AttenuationDefinition | boolean
>;

/**
 * An object representing a base package policy.
 */
export type PackagePolicy<
  PackagePolicyExtra = void,
  GlobalsPolicyExtra = void,
  BuiltinsPolicyExtra = void,
  Options = unknown,
> = {
  /**
   * The default attenuator, if any.
   */
  defaultAttenuator?: string | undefined;
  /**
   * The policy item for packages.
   */
  packages?: PolicyItem<PackagePolicyExtra> | undefined;
  /**
   * The policy item or full attenuation definition for globals.
   */
  globals?: AttenuationDefinition | PolicyItem<GlobalsPolicyExtra> | undefined;
  /**
   * The policy item or nested attenuation definition for builtins.
   */
  builtins?:
    | NestedAttenuationDefinition
    | PolicyItem<BuiltinsPolicyExtra>
    | undefined;
  /**
   * Whether to disable global freeze.
   */
  noGlobalFreeze?: boolean | undefined;
  /**
   * Whether to allow dynamic imports
   */
  dynamic?: boolean | undefined;
  /**
   * Any additional user-defined options can be added to the policy here
   */
  options?: Options | undefined;
};

/**
 * An object representing a base policy.
 */
export type Policy<
  PackagePolicyExtra = void,
  GlobalsPolicyExtra = void,
  BuiltinsPolicyExtra = void,
  Options = unknown,
> = {
  /** The package policies for the resources. */
  resources: Record<
    string,
    PackagePolicy<
      PackagePolicyExtra,
      GlobalsPolicyExtra,
      BuiltinsPolicyExtra,
      Options
    >
  >;
  /** The default attenuator. */
  defaultAttenuator?: string | undefined;
  /** The package policy for the entry. */
  entry?:
    | PackagePolicy<
        PackagePolicyExtra,
        GlobalsPolicyExtra,
        BuiltinsPolicyExtra,
        Options
      >
    | undefined;
};

/**
 * Any {@link Policy}
 */
export type SomePolicy = Policy<any, any, any, any>;

/**
 * Any {@link PackagePolicy}
 */
export type SomePackagePolicy = PackagePolicy<any, any, any, any>;
