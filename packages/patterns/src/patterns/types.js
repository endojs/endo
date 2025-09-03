/// <reference types="ses"/>

export {};

/**
 * @import {Passable, Checker} from '@endo/pass-style'
 * @import {MatcherNamespace, Pattern, GetRankCover, Kind} from '../types.js'
 */

/**
 * @typedef {object} MatchHelper
 * This factors out only the parts specific to each kind of Matcher. It is
 * encapsulated, and its methods can make the stated unchecked assumptions
 * enforced by the common calling logic.
 *
 * @property {string} tag
 *
 * @property {(allegedPayload: Passable,
 *             check: Checker
 * ) => boolean} checkIsWellFormed
 * Reports whether `allegedPayload` is valid as the payload of a CopyTagged
 * whose tag corresponds with this MatchHelper's Matchers.
 *
 * @property {(specimen: Passable,
 *             matcherPayload: Passable,
 *             check: Checker,
 * ) => boolean} checkMatches
 * Assuming validity of `matcherPayload` as the payload of a Matcher corresponding
 * with this MatchHelper, reports whether `specimen` is matched by that Matcher.
 *
 * @property {GetRankCover} getRankCover
 * Assumes this is the payload of a CopyTagged with the corresponding
 * matchTag. Return a RankCover to bound from below and above,
 * in rank order, all possible Passables that would match this Matcher.
 * The left element must be before or the same rank as any possible
 * matching specimen. The right element must be after or the same
 * rank as any possible matching specimen.
 */

/**
 * @typedef {object} PatternKit
 * @property {(specimen: any,
 *             patt: Passable,
 *             check: Checker,
 *             label?: string|number
 * ) => boolean} checkMatches
 * @property {(specimen: any, patt: Pattern) => boolean} matches
 * @property {(specimen: any, patt: Pattern, label?: string|number) => void} mustMatch
 * @property {(patt: Pattern) => void} assertPattern
 * @property {(patt: any) => boolean} isPattern
 * @property {GetRankCover} getRankCover
 * @property {(tag: string) => (MatchHelper | undefined)} maybeMatchHelper
 * @property {MatcherNamespace} M
 * @property {(specimen: Passable, check?: Checker) => Kind | undefined} kindOf
 */
