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
    getRankCover: GetRankCover;
};
export type PatternKit = {
    checkMatches: (specimen: any, patt: Passable, check: Checker, label?: string | number) => boolean;
    matches: (specimen: any, patt: Pattern) => boolean;
    mustMatch: (specimen: any, patt: Pattern, label?: string | number) => void;
    assertPattern: (patt: Pattern) => void;
    isPattern: (patt: any) => boolean;
    getRankCover: GetRankCover;
    M: MatcherNamespace;
    kindOf: (specimen: Passable, check?: Checker | undefined) => Kind | undefined;
};
import type { Passable } from '@endo/pass-style';
import type { Checker } from '@endo/pass-style';
import type { GetRankCover } from '../types.js';
import type { Pattern } from '../types.js';
import type { MatcherNamespace } from '../types.js';
import type { Kind } from '../types.js';
//# sourceMappingURL=types.d.ts.map