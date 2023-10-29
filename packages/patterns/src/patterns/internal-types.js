/// <reference types="ses"/>

/** @typedef {import('@endo/pass-style').Passable} Passable */
/** @typedef {import('@endo/pass-style').PassStyle} PassStyle */
/**
 * @template {string} [Tag=string]
 * @template {Passable} [Payload=Passable]
 * @typedef {import('@endo/pass-style').CopyTagged<Tag,Payload>} CopyTagged
 */
/**
 * @template {Passable} [T=Passable]
 * @typedef {import('@endo/pass-style').CopyRecord<T>} CopyRecord
 */
/**
 * @template {Passable} [T=Passable]
 * @typedef {import('@endo/pass-style').CopyArray<T>} CopyArray
 */
/** @typedef {import('@endo/pass-style').Checker} Checker */
/** @typedef {import('@endo/marshal').RankCompare} RankCompare */
/** @typedef {import('@endo/marshal').RankCover} RankCover */

/** @typedef {import('../types.js').AwaitArgGuardPayload} AwaitArgGuardPayload */
/** @typedef {import('../types.js').AwaitArgGuard} AwaitArgGuard */
/** @typedef {import('../types.js').RawGuard} RawGuard */
/** @typedef {import('../types.js').ArgGuard} ArgGuard */
/** @typedef {import('../types.js').MethodGuardPayload} MethodGuardPayload */
/** @typedef {import('../types.js').SyncValueGuard} SyncValueGuard */
/** @typedef {import('../types.js').MethodGuard} MethodGuard */
/**
 * @template {Record<PropertyKey, MethodGuard>} [T=Record<PropertyKey, MethodGuard>]
 * @typedef {import('../types.js').InterfaceGuardPayload<T>} InterfaceGuardPayload
 */
/**
 * @template {Record<PropertyKey, MethodGuard>} [T = Record<PropertyKey, MethodGuard>]
 * @typedef {import('../types.js').InterfaceGuard<T>} InterfaceGuard
 */
/** @typedef {import('../types.js').MethodGuardMaker} MethodGuardMaker */

/** @typedef {import('../types').MatcherNamespace} MatcherNamespace */
/** @typedef {import('../types').Key} Key */
/** @typedef {import('../types').Pattern} Pattern */
/** @typedef {import('../types').CheckPattern} CheckPattern */
/** @typedef {import('../types').Limits} Limits */
/** @typedef {import('../types').AllLimits} AllLimits */
/** @typedef {import('../types').GetRankCover} GetRankCover */

/**
 * @typedef {Exclude<PassStyle, 'tagged'> |
 *   'copySet' | 'copyBag' | 'copyMap' |
 *   `match:${any}` | `guard:${any}`
 * } Kind
 * It is either a PassStyle other than 'tagged', or, if the underlying
 * PassStyle is 'tagged', then the `getTag` value for tags that are
 * recognized at the @endo/patterns level of abstraction. For each of those
 * tags, a tagged record only has that kind if it satisfies the invariants
 * that the @endo/patterns level associates with that kind.
 */

/**
 * @typedef {object} MatchHelper
 * This factors out only the parts specific to each kind of Matcher. It is
 * encapsulated, and its methods can make the stated unchecked assumptions
 * enforced by the common calling logic.
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
 * @property {import('../types').GetRankCover} getRankCover
 * Assumes this is the payload of a CopyTagged with the corresponding
 * matchTag. Return a RankCover to bound from below and above,
 * in rank order, all possible Passables that would match this Matcher.
 * The left element must be before or the same rank as any possible
 * matching specimen. The right element must be after or the same
 * rank as any possible matching specimen.
 */

/**
 * @typedef {object} PatternKit
 * @property {(specimen: Passable,
 *             patt: Passable,
 *             check: Checker,
 *             label?: string|number
 * ) => boolean} checkMatches
 * @property {(specimen: Passable, patt: Pattern) => boolean} matches
 * @property {(specimen: Passable, patt: Pattern, label?: string|number) => void} mustMatch
 * @property {(patt: Pattern) => void} assertPattern
 * @property {(patt: Passable) => boolean} isPattern
 * @property {GetRankCover} getRankCover
 * @property {MatcherNamespace} M
 * @property {(specimen: Passable, check?: Checker) => Kind | undefined} kindOf
 */
