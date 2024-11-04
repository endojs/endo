/**
 * @file Describes the portion of a compartment map dedicated to narrowing
 * or attenuating the powers available to each compartment.
 */

/* eslint-disable no-use-before-define */

/**
 * An object representing a full attenuation definition.
 */
export type FullAttenuationDefinition = {
  /** The type of attenuation. */
  attenuate: string;
  /** The parameters for the attenuation. */
  params: ImplicitAttenuationDefinition;
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
export type UnifiedAttenuationDefinition = {
  displayName: string;
  specifier: string | null;
  params?: any[] | undefined;
};

/**
 * A type representing a wildcard policy, which can be 'any'.
 */
export type WildcardPolicy = 'any';

/**
 * A type representing a property policy, which is a record of string keys and
 * boolean values
 */
export type PropertyPolicy = Record<string, boolean>;

/**
 * A type representing a policy item, which can be a {@link WildcardPolicy
 * wildcard policy}, a property policy, `undefined`, or defined by an
 * attenuator
 */
export type PolicyItem<T = void> = WildcardPolicy | PropertyPolicy | T;

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
  PackagePolicyItem = void,
  GlobalsPolicyItem = void,
  BuiltinsPolicyItem = void,
  ExtraOptions = unknown,
> = {
  /** The default attenuator. */
  defaultAttenuator?: string | undefined;
  /** The policy item for packages. */
  packages?: PolicyItem<PackagePolicyItem> | undefined;
  /** The policy item or full attenuation definition for globals. */
  globals?: AttenuationDefinition | PolicyItem<GlobalsPolicyItem> | undefined;
  /** The policy item or nested attenuation definition for builtins. */
  builtins?:
    | NestedAttenuationDefinition
    | PolicyItem<BuiltinsPolicyItem>
    | undefined;
  /** Whether to disable global freeze. */
  noGlobalFreeze?: boolean | undefined;
  /** Whether to allow dynamic imports */
  dynamic?: boolean | undefined;
  /** Any additional user-defined options can be added to the policy here */
  options?: ExtraOptions | undefined;
};

/**
 * An object representing a base policy.
 */
export type Policy<
  PackagePolicyItem = void,
  GlobalsPolicyItem = void,
  BuiltinsPolicyItem = void,
  ExtraOptions = unknown,
> = {
  /** The package policies for the resources. */
  resources: Record<
    string,
    PackagePolicy<
      PackagePolicyItem,
      GlobalsPolicyItem,
      BuiltinsPolicyItem,
      ExtraOptions
    >
  >;
  /** The default attenuator. */
  defaultAttenuator?: string | undefined;
  /** The package policy for the entry. */
  entry?:
    | PackagePolicy<
        PackagePolicyItem,
        GlobalsPolicyItem,
        BuiltinsPolicyItem,
        ExtraOptions
      >
    | undefined;
};

/** Any {@link Policy} */
export type SomePolicy = Policy<any, any, any, any>;

/** Any {@link PackagePolicy} */
export type SomePackagePolicy = PackagePolicy<
  PolicyItem,
  PolicyItem,
  PolicyItem,
  unknown
>;
