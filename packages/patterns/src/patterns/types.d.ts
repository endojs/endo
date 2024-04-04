export type Passable = import('@endo/pass-style').Passable;
export type PassStyle = import('@endo/pass-style').PassStyle;
export type CopyTagged<Tag extends string = string, Payload extends unknown = any> = import('@endo/pass-style').CopyTagged<Tag, Payload>;
export type CopyRecord<T extends unknown = any> = import('@endo/pass-style').CopyRecord<T>;
export type CopyArray<T extends unknown = any> = import('@endo/pass-style').CopyArray<T>;
export type Checker = import('@endo/pass-style').Checker;
export type RankCompare = import('@endo/marshal').RankCompare;
export type RankCover = import('@endo/marshal').RankCover;
export type AwaitArgGuardPayload = import('../types.js').AwaitArgGuardPayload;
export type AwaitArgGuard = import('../types.js').AwaitArgGuard;
export type RawGuard = import('../types.js').RawGuard;
export type ArgGuard = import('../types.js').ArgGuard;
export type MethodGuardPayload = import('../types.js').MethodGuardPayload;
export type SyncValueGuard = import('../types.js').SyncValueGuard;
export type MethodGuard = import('../types.js').MethodGuard;
export type InterfaceGuardPayload<T extends Record<PropertyKey, import("../types.js").MethodGuard> = Record<PropertyKey, import("../types.js").MethodGuard>> = import('../types.js').InterfaceGuardPayload<T>;
export type InterfaceGuard<T extends Record<PropertyKey, import("../types.js").MethodGuard> = Record<PropertyKey, import("../types.js").MethodGuard>> = import('../types.js').InterfaceGuard<T>;
export type MethodGuardMaker = import('../types.js').MethodGuardMaker;
export type MatcherNamespace = import('../types').MatcherNamespace;
export type Key = import('../types').Key;
export type Pattern = import('../types').Pattern;
export type CheckPattern = import('../types').CheckPattern;
export type Limits = import('../types').Limits;
export type AllLimits = import('../types').AllLimits;
export type GetRankCover = import('../types').GetRankCover;
/**
 * It is either a PassStyle other than 'tagged', or, if the underlying
 * PassStyle is 'tagged', then the `getTag` value for tags that are
 * recognized at the
 */
export type Kind = Exclude<PassStyle, 'tagged'> | 'copySet' | 'copyBag' | 'copyMap' | `match:${any}` | `guard:${any}`;
/**
 * This factors out only the parts specific to each kind of Matcher. It is
 * encapsulated, and its methods can make the stated unchecked assumptions
 * enforced by the common calling logic.
 */
export type MatchHelper = {
    /**
     * Reports whether `allegedPayload` is valid as the payload of a CopyTagged
     * whose tag corresponds with this MatchHelper's Matchers.
     */
    checkIsWellFormed: (allegedPayload: Passable, check: Checker) => boolean;
    /**
     * Assuming validity of `matcherPayload` as the payload of a Matcher corresponding
     * with this MatchHelper, reports whether `specimen` is matched by that Matcher.
     */
    checkMatches: (specimen: Passable, matcherPayload: Passable, check: Checker) => boolean;
    /**
     * Assumes this is the payload of a CopyTagged with the corresponding
     * matchTag. Return a RankCover to bound from below and above,
     * in rank order, all possible Passables that would match this Matcher.
     * The left element must be before or the same rank as any possible
     * matching specimen. The right element must be after or the same
     * rank as any possible matching specimen.
     */
    getRankCover: import('../types').GetRankCover;
};
export type PatternKit = {
    checkMatches: (specimen: Passable, patt: Passable, check: Checker, label?: string | number) => boolean;
    matches: (specimen: Passable, patt: Pattern) => boolean;
    mustMatch: (specimen: Passable, patt: Pattern, label?: string | number) => void;
    assertPattern: (patt: Pattern) => void;
    isPattern: (patt: Passable) => boolean;
    getRankCover: GetRankCover;
    M: MatcherNamespace;
    kindOf: (specimen: Passable, check?: Checker) => Kind | undefined;
};
//# sourceMappingURL=types.d.ts.map