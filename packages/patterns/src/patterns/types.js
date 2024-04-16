/// <reference types="ses"/>

export {};

/** @import {Passable} from '@endo/pass-style' */
/** @import {PassStyle} from '@endo/pass-style' */
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
/** @import {Checker} from '@endo/pass-style' */
/** @import {RankCompare} from '@endo/marshal' */
/** @import {RankCover} from '@endo/marshal' */

/** @import {AwaitArgGuardPayload} from '../types.js' */
/** @import {AwaitArgGuard} from '../types.js' */
/** @import {RawGuard} from '../types.js' */
/** @import {ArgGuard} from '../types.js' */
/** @import {MethodGuardPayload} from '../types.js' */
/** @import {SyncValueGuard} from '../types.js' */
/** @import {MethodGuard} from '../types.js' */
/**
 * @template {Record<PropertyKey, MethodGuard>} [T=Record<PropertyKey, MethodGuard>]
 * @typedef {import('../types.js').InterfaceGuardPayload<T>} InterfaceGuardPayload
 */
/**
 * @template {Record<PropertyKey, MethodGuard>} [T = Record<PropertyKey, MethodGuard>]
 * @typedef {import('../types.js').InterfaceGuard<T>} InterfaceGuard
 */
/** @import {MethodGuardMaker} from '../types.js' */

/** @import {MatcherNamespace} from '../types' */
/** @import {Key} from '../types' */
/** @import {Pattern} from '../types' */
/** @import {CheckPattern} from '../types' */
/** @import {Limits} from '../types' */
/** @import {AllLimits} from '../types' */
/** @import {GetRankCover} from '../types' */

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
