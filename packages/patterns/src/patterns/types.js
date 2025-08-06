/// <reference types="ses"/>

export {};

/**
 * @import {Rejector} from '@endo/errors/rejector.js';
 * @import {Passable} from '@endo/pass-style';
 * @import {MatcherNamespace, Pattern, GetRankCover, Kind} from '../types.js';
 */

/**
 * @typedef {object} MatchHelper
 * This factors out only the parts specific to each kind of Matcher. It is
 * encapsulated, and its methods can make the stated unchecked assumptions
 * enforced by the common calling logic.
 *
 * @property {(allegedPayload: Passable,
 *             reject: Rejector
 * ) => boolean} confirmIsWellFormed
 * Reports whether `allegedPayload` is valid as the payload of a CopyTagged
 * whose tag corresponds with this MatchHelper's Matchers.
 *
 * @property {(specimen: Passable,
 *             matcherPayload: Passable,
 *             reject: Rejector,
 * ) => boolean} confirmMatches
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
 *             reject: Rejector,
 *             label?: string|number
 * ) => boolean} confirmMatches
 * @property {(specimen: any, patt: Pattern) => boolean} matches
 * @property {(specimen: any, patt: Pattern, label?: string|number) => void} mustMatch
 * @property {(patt: Pattern) => void} assertPattern
 * @property {(patt: any) => boolean} isPattern
 * @property {GetRankCover} getRankCover
 * @property {MatcherNamespace} M
 * @property {(specimen: Passable, reject: Rejector) => Kind | undefined} kindOf
 */
