/**
 * Const string to identify the internal attenuators compartment
 */
export const ATTENUATORS_COMPARTMENT: "<ATTENUATORS>";
export function detectAttenuators(policy?: import("./types.js").Policy<void, void, void> | undefined): Array<string>;
export function dependencyAllowedByPolicy(namingKit: import('./types.js').PackageNamingKit, packagePolicy: import('./types.js').PackagePolicy): boolean;
/**
 * Returns the policy applicable to the canonicalName of the package
 *
 * @overload
 * @param {import('./types.js').PackageNamingKit} namingKit - a key in the policy resources spec is derived from these
 * @param {import('./types.js').Policy} policy - user supplied policy
 * @returns {import('./types.js').PackagePolicy} packagePolicy if policy was specified
 */
export function getPolicyForPackage(namingKit: import('./types.js').PackageNamingKit, policy: import('./types.js').Policy): import('./types.js').PackagePolicy;
/**
 * Returns `undefined`
 *
 * @overload
 * @param {import('./types.js').PackageNamingKit} namingKit - a key in the policy resources spec is derived from these
 * @param {import('./types.js').Policy} [policy] - user supplied policy
 * @returns {import('./types.js').PackagePolicy|undefined} packagePolicy if policy was specified
 */
export function getPolicyForPackage(namingKit: import('./types.js').PackageNamingKit, policy?: import("./types.js").Policy<void, void, void> | undefined): import('./types.js').PackagePolicy | undefined;
export function makeDeferredAttenuatorsProvider(compartments: Record<string, Compartment>, compartmentDescriptors: Record<string, import('./types.js').CompartmentDescriptor>): import('./types.js').DeferredAttenuatorsProvider;
export function attenuateGlobals(globalThis: object, globals: object, packagePolicy: import('./types.js').PackagePolicy, attenuators: import('./types.js').DeferredAttenuatorsProvider, pendingJobs: Array<Promise<any>>, name?: string): void;
export function enforceModulePolicy(specifier: string, compartmentDescriptor: import('./types.js').CompartmentDescriptor, { exit, errorHint }?: EnforceModulePolicyOptions | undefined): void;
export function attenuateModuleHook(specifier: string, originalModuleRecord: import('ses').ThirdPartyStaticModuleInterface, policy: import('./types.js').PackagePolicy, attenuators: import('./types.js').DeferredAttenuatorsProvider): Promise<import('ses').ThirdPartyStaticModuleInterface>;
/**
 * Options for {@link enforceModulePolicy }
 */
export type EnforceModulePolicyOptions = {
    /**
     * - Whether it is an exit module
     */
    exit?: boolean | undefined;
    /**
     * - Error hint message
     */
    errorHint?: string | undefined;
};
//# sourceMappingURL=policy.d.ts.map