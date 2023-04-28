/// <reference types="ses"/>

export {};

/**
 * @import {Passable, Checker} from '@endo/pass-style'
 * @import {MatcherNamespace, Pattern, GetRankCover, Compress, Decompress, CompressedRecord, Kind} from '../types.js'
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
 * @property {(specimen: Passable,
 *             matcherPayload: Passable,
 *             compress: Compress
 * ) => (CompressedRecord | undefined)} [compress]
 * Assuming a valid Matcher of this type with `matcherPayload` as its
 * payload, if this specimen matches this matcher, then return a
 * CompressedRecord that represents this specimen,
 * perhaps more compactly, given the knowledge that it matches this matcher.
 * If the specimen does not match the matcher, return undefined.
 * If this matcher has a `compress` method, then it must have a matching
 * `decompress` method.
 *
 * @property {(compressed: Passable,
 *             matcherPayload: Passable,
 *             decompress: Decompress
 * ) => Passable} [decompress]
 * If `compressed` is the result of a successful `compress` with this matcher,
 * then `decompress` must return a Passable equivalent to the original specimen.
 * If this matcher has an `decompress` method, then it must have a matching
 * `compress` method.
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
