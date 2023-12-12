/**
 * Const string to identify the internal attenuators compartment
 */
export const ATTENUATORS_COMPARTMENT: "<ATTENUATORS>";
export function detectAttenuators(policy: object): Array<string>;
export function dependencyAllowedByPolicy(namingKit: PackageNamingKit, packagePolicy: any): boolean;
export function getPolicyForPackage(namingKit: PackageNamingKit, policy: object | undefined): object | undefined;
export function makeDeferredAttenuatorsProvider(compartments: Record<string, Compartment>, compartmentDescriptors: Record<string, CompartmentDescriptor>): DeferredAttenuatorsProvider;
export function attenuateGlobals(globalThis: object, globals: object, packagePolicy: object, attenuators: DeferredAttenuatorsProvider, pendingJobs: Array<Promise<any>>, name?: string): void;
export function enforceModulePolicy(specifier: string, compartmentDescriptor: import('./types.js').CompartmentDescriptor, info?: object): void;
export function attenuateModuleHook(specifier: string, originalModuleRecord: ThirdPartyStaticModuleInterface, policy: object, attenuators: DeferredAttenuatorsProvider): Promise<ThirdPartyStaticModuleInterface>;
export type PackageNamingKit = import('./types.js').PackageNamingKit;
export type AttenuationDefinition = import('./types.js').AttenuationDefinition;
export type FullAttenuationDefinition = import('./types.js').FullAttenuationDefinition;
export type ImplicitAttenuationDefinition = import('./types.js').ImplicitAttenuationDefinition;
export type Attenuator = import('./types.js').Attenuator;
export type DeferredAttenuatorsProvider = import('./types.js').DeferredAttenuatorsProvider;
export type CompartmentDescriptor = import('./types.js').CompartmentDescriptor;
export type ThirdPartyStaticModuleInterface = import('ses').ThirdPartyStaticModuleInterface;
//# sourceMappingURL=policy.d.ts.map