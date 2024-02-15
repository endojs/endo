export namespace defaultLimits {
    let decimalDigitsLimit: number;
    let stringLengthLimit: number;
    let symbolNameLengthLimit: number;
    let numPropertiesLimit: number;
    let propertyNameLengthLimit: number;
    let arrayLengthLimit: number;
    let numSetElementsLimit: number;
    let numUniqueBagElementsLimit: number;
    let numMapEntriesLimit: number;
}
export const checkMatches: (specimen: any, patt: any, check: import("@endo/marshal").Checker, label?: string | number | undefined) => boolean;
export const matches: (specimen: any, patt: any) => boolean;
export const mustMatch: (specimen: any, patt: any, label?: string | number | undefined) => void;
export const assertPattern: (patt: any) => void;
export const isPattern: (patt: any) => boolean;
export const getRankCover: import("../types.js").GetRankCover;
export const M: import("../types.js").MatcherNamespace;
export const kindOf: (specimen: any, check?: import("@endo/marshal").Checker | undefined) => import("./types.js").Kind | undefined;
export const AwaitArgGuardShape: import("../types.js").Matcher;
export function isAwaitArgGuard(specimen: any): specimen is import("../types.js").AwaitArgGuard;
export function assertAwaitArgGuard(specimen: any): asserts specimen is import("../types.js").AwaitArgGuard;
export const RawGuardShape: import("../types.js").Matcher;
export function isRawGuard(specimen: any): boolean;
export function assertRawGuard(specimen: any): void;
export const SyncValueGuardShape: import("../types.js").Matcher;
export const SyncValueGuardListShape: import("../types.js").Matcher;
export const ArgGuardListShape: import("../types.js").Matcher;
export const MethodGuardPayloadShape: import("../types.js").Matcher;
export const MethodGuardShape: import("../types.js").Matcher;
export function assertMethodGuard(specimen: any): asserts specimen is import("../types.js").MethodGuard;
export const InterfaceGuardPayloadShape: import("../types.js").Matcher;
export const InterfaceGuardShape: import("../types.js").Matcher;
export function assertInterfaceGuard(specimen: any): asserts specimen is import("./types.js").InterfaceGuard<Record<PropertyKey, import("../types.js").MethodGuard>>;
//# sourceMappingURL=patternMatchers.d.ts.map