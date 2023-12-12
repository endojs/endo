export function policyLookupHelper(packagePolicy: object, field: string, itemName: string): boolean | object;
export function isAllowingEverything(policyValue: any): boolean;
export function isAttenuationDefinition(potentialDefinition: AttenuationDefinition): boolean;
export function getAttenuatorFromDefinition(attenuationDefinition: AttenuationDefinition): UnifiedAttenuationDefinition;
export function assertPackagePolicy(allegedPackagePolicy: unknown, path: string, url?: string | undefined): void;
export function assertPolicy(allegedPolicy: unknown): void;
export type AttenuationDefinition = import('./types.js').AttenuationDefinition;
export type UnifiedAttenuationDefinition = import('./types.js').UnifiedAttenuationDefinition;
//# sourceMappingURL=policy-format.d.ts.map