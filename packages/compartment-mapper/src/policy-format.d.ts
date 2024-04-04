export function policyLookupHelper(packagePolicy: import('./types.js').PackagePolicy, field: 'builtins' | 'globals' | 'packages', itemName: string): boolean | import('./types.js').AttenuationDefinition;
export function isAllowingEverything(policyValue: unknown): policyValue is import('./types.js').WildcardPolicy;
export function isAttenuationDefinition(allegedDefinition: unknown): allegedDefinition is import('./types.js').AttenuationDefinition;
export function getAttenuatorFromDefinition(attenuationDefinition: import('./types.js').AttenuationDefinition): import('./types.js').UnifiedAttenuationDefinition;
export function assertPackagePolicy(allegedPackagePolicy: unknown, path: string, url?: string | undefined): asserts allegedPackagePolicy is import('./types.js').PackagePolicy | undefined;
export function assertPolicy(allegedPolicy: unknown): asserts allegedPolicy is import('./types.js').Policy | undefined;
//# sourceMappingURL=policy-format.d.ts.map