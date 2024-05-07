/// <reference types="ses"/>

export {};

// NB: as of TS 5.5 nightly, TS thinks RankCover and Checker "is declared but never read" but they are
/**
 * @import {Checker, CopyArray, CopyRecord, CopyTagged, Passable, PassStyle, Primitive, RemotableObject} from '@endo/pass-style';
 * @import {RankCompare, RankCover} from '@endo/marshal';
 */

/**
 * @typedef {Exclude<Passable<RemotableObject, never>, Error | Promise>} Key
 *
 * Keys are Passable arbitrarily-nested pass-by-copy containers
 * (CopyArray, CopyRecord, CopySet, CopyBag, CopyMap) in which every
 * non-container leaf is either a Passable primitive value or a Remotable (a
 * remotely-accessible object or presence for a remote object), or such leaves
 * in isolation with no container.
 *
 * Keys are so named because they can be used as keys in CopyMaps and
 * [agoric-sdk Stores](https://github.com/Agoric/agoric-sdk/blob/master/packages/store/docs/store-taxonomy.md),
 * and as elements in CopySets and CopyBags.
 *
 * Keys cannot contain promises or errors, as these do not have useful
 * distributed equality semantics. Keys also cannot contain any CopyTagged
 * except for those recognized as CopySets, CopyBags, and CopyMaps.
 *
 * Be aware that we may recognize more CopyTaggeds over time, including
 * CopyTaggeds recognized as Keys.
 *
 * Distributed equality is location independent.
 * The same two Keys, passed to another location, will be `keyEQ` there iff
 * they are `keyEQ` here. (`keyEQ` tests equality according to the
 * key distributed equality semantics.)
 */

/**
 * @typedef {Primitive | RemotableObject} ScalarKey
 */

/**
 * @callback GetRankCover
 * @param {Passable} payload
 * @param {KeyToDBKey} encodePassable
 * @returns {RankCover}
 */

/**
 * @callback KeyToDBKey
 * @param {Key} key
 * @returns {string}
 */

/**
 * @typedef {Exclude<Passable, Error | Promise>} Pattern
 *
 * Patterns are Passable arbitrarily-nested pass-by-copy containers
 * (CopyArray, CopyRecord, CopySet, CopyBag, CopyMap) in which every
 * non-container leaf is either a Key or a Matcher, or such leaves in isolation
 * with no container.
 *
 * A Pattern acts as a declarative total predicate over Passables, where each
 * Passable is either matched or not matched by it. Every Key is also a Pattern
 * that matches only "itself", i.e., Keys that are `keyEQ` to it according to
 * the key distributed equality semantics.
 *
 * Patterns cannot contain promises or errors, as these do
 * not have useful distributed equality or matching semantics. Likewise,
 * no Pattern can distinguish among promises, or distinguish among errors.
 * Patterns also cannot contain any CopyTaggeds except for those recognized as
 * CopySets, CopyBags, CopyMaps, or Matchers.
 *
 * Be aware that we may recognize more CopyTaggeds over time, including
 * CopyTaggeds recognized as Patterns.
 *
 * Whether a Passable is matched by a given Pattern is location independent.
 * If a given Passable and Pattern are passed to another location,
 * the Passable will be matched by the Pattern there iff the Passable is matched
 * by the Pattern here.
 *
 * Patterns are often used in a type-like manner, to represent the category
 * of Passables that the Pattern is intended* to match. To keep this
 * distinction clear, we often use the suffix "Shape" rather than "Pattern"
 * to avoid confusion when the Pattern itself represents
 * some category of Pattern. For example, an "AmountShape" represents the
 * category of Amounts. And "AmountPatternShape" represents the
 * category of Patterns over Amounts.
 *
 * * We say "intended" above because Patterns, in order to be declarative
 * and Passable, cannot have the generality of predicates written in a
 * Turing-universal programming language. Rather, to represent the category of
 * things intended to be a Foo, a FooShape should reliably
 * accept all Foos and reject only non-Foos. However, a FooShape may also accept
 * non-Foos that "look like" or "have the same shape as" genuine Foos.
 * An accurate predicate for e.g. input validation would need to supplement the
 * Pattern check with code to detect the residual cases.
 * We hope the "Shape" metaphor helps remind us of this type-like imprecision
 * of Patterns.
 */

// TODO parameterize CopyTagged to support these refinements

/**
 * @template {Key} [K=Key]
 * @typedef {CopyTagged<'copySet', K[]>} CopySet
 *
 * A Passable collection of Keys that are all mutually distinguishable
 * according to the key distributed equality semantics exposed by `keyEQ`.
 */

/**
 * @template {Key} [K=Key]
 * @typedef {CopyTagged<'copyBag', [K, bigint][]>} CopyBag
 *
 * A Passable collection of entries with Keys that are all mutually distinguishable
 * according to the key distributed equality semantics exposed by `keyEQ`,
 * each with a corresponding positive cardinality.
 */

/**
 * @template {Key} [K=Key]
 * @template {Passable} [V=Passable]
 * @typedef {CopyTagged<'copyMap', { keys: K[], values: V[] }>} CopyMap
 *
 * A Passable collection of entries with Keys that are all mutually distinguishable
 * according to the key distributed equality semantics exposed by `keyEQ`,
 * each with a corresponding Passable value.
 */

/**
 * @typedef {CopySet | CopyBag | CopyMap} KeyCollection
 *
 * CopySet, CopyBag, and CopyMap all store Keys in reverse rankOrder,
 * which supports generalized utilities.
 */

// TODO: enumerate Matcher tag values?
/**
 * @typedef {CopyTagged<`match:${string}`, Passable>} Matcher
 *
 * A Pattern representing the predicate characterizing a category of Passables,
 * such as strings or 8-bit unsigned integer numbers or CopyArrays of Remotables.
 */

/**
 * @typedef {RankCompare} FullCompare
 * A `FullCompare` function satisfies all the invariants stated below for
 * `RankCompare`'s relation with KeyCompare.
 * In addition, its equality is as precise as the `KeyCompare`
 * comparison defined below, in that, for all Keys `x` and `y`,
 * `FullCompare(x, y) === 0` iff `KeyCompare(x, y) === 0`.
 *
 * For non-Key inputs, a `FullCompare` should be exactly as imprecise as
 * `RankCompare`. For example, both will treat all errors as in the same
 * equivalence class. Both will treat all promises as in the same
 * equivalence class. Both will order tagged records the same way, which is
 * admittedly weird because some (such as CopySets, CopyBags, and CopyMaps)
 * will be considered Keys while others will be considered non-Keys.
 */

/**
 * @typedef {object} RankComparatorKit
 * @property {RankCompare} comparator
 * @property {RankCompare} antiComparator
 */

/**
 * @typedef {object} FullComparatorKit
 * @property {FullCompare} comparator
 * @property {FullCompare} antiComparator
 */

/**
 * @typedef {-1 | 0 | 1 | NaN} KeyComparison
 * The result of a `KeyCompare` function that defines a meaningful
 * and meaningfully precise partial order of Key values. See `KeyCompare`.
 */

/**
 * @callback KeyCompare
 * `compareKeys` implements a partial order over Keys --- it defines relative
 * position between two Keys but leaves some pairs incomparable (for example,
 * subsets over sets is a partial order in which {} precedes {x} and {y}, which
 * are mutually incomparable but both precede {x, y}). As with the rank ordering
 * produced by `compareRank`, -1, 0, and 1 respectively mean "less than",
 * "equivalent to", and "greater than". NaN means "incomparable" --- the first
 * key is not less, equivalent, or greater than the second.
 *
 * By using NaN for "incomparable", the normal equivalence for using
 * the return value in a comparison is preserved.
 * `compareKeys(left, right) >= 0` iff `left` is greater than or
 * equivalent to `right` in the partial ordering.
 *
 * Key order (a partial order) and rank order (a total preorder) are
 * co-designed to support efficient range search for Key-based queries
 * (@see {@link ../README.md#rank-order-and-key-order}).
 *
 * @param {Key} left
 * @param {Key} right
 * @returns {KeyComparison}
 */

/**
 * @callback CheckPattern
 * @param {Passable} allegedPattern
 * @param {Checker} check
 * @returns {boolean}
 */

/**
 * @typedef {object} AllLimits
 * @property {number} decimalDigitsLimit
 * @property {number} stringLengthLimit
 * @property {number} symbolNameLengthLimit
 * @property {number} numPropertiesLimit
 * @property {number} propertyNameLengthLimit
 * @property {number} arrayLengthLimit
 * @property {number} numSetElementsLimit
 * @property {number} numUniqueBagElementsLimit
 * @property {number} numMapEntriesLimit
 */

/**
 * @typedef {Partial<AllLimits>} Limits
 */

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
 * @typedef {object} PatternMatchers
 *
 * @property {() => Matcher} any
 * Matches any Passable.
 *
 * @property {(...subPatts: Pattern[]) => Matcher} and
 * Matches against the intersection of all sub-Patterns.
 *
 * @property {(...subPatts: Pattern[]) => Matcher} or
 * Matches against the union of all sub-Patterns
 * (requiring a successful match against at least one).
 *
 * @property {(subPatt: Pattern) => Matcher} not
 * Matches against the negation of the sub-Pattern.
 *
 * @property {() => Matcher} scalar
 * Matches any Passable primitive value or Remotable.
 * All matched values are Keys.
 *
 * @property {() => Matcher} key
 * Matches any value that can be a key in a CopyMap
 * or an element in a CopySet or CopyBag.
 * All matched values are also valid Patterns that match only themselves.
 *
 * @property {() => Matcher} pattern
 * Matches any Pattern that can be used to characterize Passables.
 * A Pattern cannot contain promises or errors,
 * as these are not stable enough to usefully match.
 *
 * @property {(kind: PassStyle | string) => Matcher} kind
 * When `kind` specifies a PassStyle other than "tagged",
 * matches any value having that PassStyle.
 * Otherwise, when `kind` specifies a known tagged record tag
 * (such as 'copySet', 'copyBag', 'copyMap', or 'match:scalar'),
 * matches any CopyTagged with that tag and a valid tag-specific payload.
 * Otherwise, does not match any value.
 * TODO: Reject attempts to create a kind matcher with unknown `kind`?
 *
 * @property {(tagPatt?: Pattern, payloadPatt?: Pattern) => Matcher} tagged
 * For matching an arbitrary Passable Tagged object, whether it has a
 * recognized kind or not. If `tagPatt` is omitted, it defaults to
 * `M.string()`. If `payloadPatt` is omitted, it defaults to
 * `M.any()`.
 *
 * @property {() => Matcher} boolean
 * Matches `true` or `false`.
 *
 * @property {() => Matcher} number
 * Matches any floating point number,
 * including `NaN` and either signed Infinity.
 *
 * @property {(limits?: Limits) => Matcher} bigint
 * Matches any bigint, subject to limits.
 *
 * @property {(limits?: Limits) => Matcher} nat
 * Matches any non-negative bigint, subject to limits.
 *
 * @property {(limits?: Limits) => Matcher} string
 * Matches any string, subject to limits.
 *
 * @property {(limits?: Limits) => Matcher} symbol
 * Matches any registered or well-known symbol,
 * subject to limits.
 *
 * @property {(limits?: Limits) => Matcher} record
 * Matches any CopyRecord, subject to limits.
 *
 * @property {(limits?: Limits) => Matcher} array
 * Matches any CopyArray, subject to limits.
 *
 * @property {(limits?: Limits) => Matcher} set
 * Matches any CopySet, subject to limits.
 *
 * @property {(limits?: Limits) => Matcher} bag
 * Matches any CopyBag, subject to limits.
 *
 * @property {(limits?: Limits) => Matcher} map
 * Matches any CopyMap, subject to limits.
 *
 * @property {(label?: string) => Matcher} remotable
 * Matches a far object or its remote presence.
 * The optional `label` is purely for diagnostic purposes and does not
 * add any constraints.
 *
 * @property {() => Matcher} error
 * Matches any error object.
 * Error objects are Passable, but are neither Keys nor Patterns.
 * They do not have a useful identity.
 *
 * @property {() => Matcher} promise
 * Matches any promise object.
 * Promises are Passable, but are neither Keys nor Patterns.
 * They do not have a useful identity.
 *
 * @property {() => Matcher} undefined
 * Matches the exact value `undefined`.
 * All keys including `undefined` are already valid Patterns and
 * so can validly represent themselves.
 * But optional Pattern arguments `(patt = undefined) => ...`
 * treat explicit `undefined` as omission of the argument.
 * Thus, when a passed Pattern does not also need to be a Key,
 * we recommend passing `M.undefined()` rather than `undefined`.
 *
 * @property {() => null} null
 * Returns `null`, which matches only itself.
 *
 * @property {(rightOperand :Key) => Matcher} lt
 * Matches any value that compareKeys reports as less than rightOperand.
 *
 * @property {(rightOperand :Key) => Matcher} lte
 * Matches any value that compareKeys reports as less than or equal to
 * rightOperand.
 *
 * @property {(key :Key) => Matcher} eq
 * Matches any value that is equal to key.
 *
 * @property {(key :Key) => Matcher} neq
 * Matches any value that is not equal to key.
 *
 * @property {(rightOperand :Key) => Matcher} gte
 * Matches any value that compareKeys reports as greater than or equal
 * to rightOperand.
 *
 * @property {(rightOperand :Key) => Matcher} gt
 * Matches any value that compareKeys reports as greater than
 * rightOperand.
 *
 * @property {(subPatt?: Pattern, limits?: Limits) => Matcher} arrayOf
 * Matches any CopyArray whose elements are all matched by `subPatt`
 * if defined, subject to limits.
 *
 * @property {(keyPatt?: Pattern,
 *             valuePatt?: Pattern,
 *             limits?: Limits
 * ) => Matcher} recordOf
 * Matches any CopyRecord whose keys are all matched by `keyPatt`
 * if defined and values are all matched by `valuePatt` if defined,
 * subject to limits.
 *
 * @property {(keyPatt?: Pattern, limits?: Limits) => Matcher} setOf
 * Matches any CopySet whose elements are all matched by `keyPatt`
 * if defined, subject to limits.
 *
 * @property {(keyPatt?: Pattern,
 *             countPatt?: Pattern,
 *             limits?: Limits
 * ) => Matcher} bagOf
 * Matches any CopyBag whose elements are all matched by `keyPatt`
 * if defined and the cardinality of each is matched by `countPatt`
 * if defined, subject to limits.
 * `countPatt` is expected to rarely be useful,
 * but is provided to minimize surprise.
 *
 * @property {(keyPatt?: Pattern,
 *             valuePatt?: Pattern,
 *             limits?: Limits
 * ) => Matcher} mapOf
 * Matches any CopyMap whose keys are all matched by `keyPatt` if defined
 * and values are all matched by `valuePatt` if defined,
 * subject to limits.
 *
 * @property {(required: Pattern[],
 *             optional?: Pattern[],
 *             rest?: Pattern,
 * ) => Matcher} splitArray
 * Matches any array --- typically an arguments list --- consisting of
 *   - an initial portion matched by `required`, and
 *   - a middle portion of length up to the length of `optional` that is
 *     matched by the equal-length prefix of `optional` if `optional` is
 *     defined, and
 *   - a remainder that is matched by `rest` if `rest` is defined.
 * The array must be at least as long as `required`
 * but its remainder can be arbitrarily short.
 * Any array elements beyond the summed length of `required` and `optional`
 * are collected and matched against `rest`.
 *
 * @property {(required: CopyRecord<Pattern>,
 *             optional?: CopyRecord<Pattern>,
 *             rest?: Pattern,
 * ) => Matcher} splitRecord
 * Matches any CopyRecord that can be split into component CopyRecords
 * as follows:
 *   - all properties corresponding with a property of `required`
 *   - all properties corresponding with a property of `optional`
 *     but not corresponding with a property of `required`
 *   - all other properties
 * where the first component is matched by `required`,
 * the second component is matched by the subset of `optional`
 * corresponding with its properties if `optional` is defined, and
 * the third component is matched by `rest` if defined.
 * The CopyRecord must have all properties that appear on `required`,
 * but may omit properties that appear on `optional`.
 *
 * @property {(basePatt: CopyRecord<any> | CopyArray<any>,
 *             rest?: Pattern,
 * ) => Matcher} split
 * Deprecated. Use `M.splitArray` or `M.splitRecord` instead.
 * An array or record is split into the first part that is matched by
 * `basePatt`, and the remainder, which is matched against `rest` if present.
 *
 * @property {(basePatt: CopyRecord<any> | CopyArray<any>,
 *             rest?: Pattern,
 * ) => Matcher} partial
 * Deprecated. Use `M.splitArray` or `M.splitRecord` instead.
 * An array or record is split into the first part that is matched by
 * `basePatt`, and the remainder, which is matched against `rest` if present.
 * `M.partial` differs from `M.split` in the handling of data that is
 * described in `basePatt` but absent in a provided specimen:
 *   - For a CopyRecord, `M.partial` ignores properties of `basePatt`
 *     that are not present on the specimen.
 *   - For a CopyArray, `M.partial` ignores elements of `basePatt`
 *     at indices beyond the maximum index of the specimen.
 *
 * @property {(subPatt: Pattern) => Pattern} eref
 * Matches any Passable that is either matched by `subPatt` or is a promise object.
 * Note that validation is immediate, so (unlike the TypeScript `ERef<T>`
 * type) `M.eref` matches a promise object whose fulfillment value is
 * _not_ matched by `subPatt`.
 * For describing a top-level parameter,
 * `M.callWhen(..., M.await(p), ...)` is preferred over `M.call(..., M.eref(p), ...)`
 * because the former always checks against the sub-Pattern (awaiting fulfillment
 * if necessary) while the latter bypasses such checks when the relevant argument
 * is a promise.
 *
 * @property {(subPatt: Pattern) => Pattern} opt
 * Matches any Passable that is matched by `subPatt` or is the exact value `undefined`.
 */

/**
 * @typedef {undefined | 'passable' | 'raw'} DefaultGuardType
 */

/**
 * @typedef {<M extends Record<PropertyKey, MethodGuard>>(
 *   interfaceName: string,
 *   methodGuards: M,
 *   options: {defaultGuards?: undefined, sloppy?: false }) => InterfaceGuard<M>
 * } MakeInterfaceGuardStrict
 */
/**
 * @typedef {(
 *   interfaceName: string,
 *   methodGuards: any,
 *   options: {defaultGuards?: 'passable' | 'raw', sloppy?: true }) => InterfaceGuard<any>
 * } MakeInterfaceGuardSloppy
 */
/**
 * @typedef {<M extends Record<PropertyKey, MethodGuard>>(
 *   interfaceName: string,
 *   methodGuards: M,
 *   options?: {defaultGuards?: DefaultGuardType, sloppy?: boolean}) => InterfaceGuard<M>
 * } MakeInterfaceGuardGeneral
 */
/** @typedef {MakeInterfaceGuardStrict & MakeInterfaceGuardSloppy & MakeInterfaceGuardGeneral} MakeInterfaceGuard */

/**
 * @typedef {object} GuardMakers
 *
 * @property {MakeInterfaceGuard} interface
 * Guard the interface of an exo object
 *
 * @property {(...argPatterns: SyncValueGuard[]) => MethodGuardMaker} call
 * Guard a synchronous call.  Arguments not guarded by `M.raw()` are
 * automatically hardened and must be at least Passable.
 *
 * @property {(...argGuards: ArgGuard[]) => MethodGuardMaker} callWhen
 * Guard an async call.  Arguments not guarded by `M.raw()` are automatically
 * hardened and must be at least Passable.
 *
 * @property {(argPattern: Pattern) => AwaitArgGuard} await
 * Guard a positional parameter in `M.callWhen`, awaiting it and matching its
 * fulfillment against the provided pattern.
 * For example, `M.callWhen(M.await(M.nat())).returns()` will await the first
 * argument, check that its fulfillment satisfies `M.nat()`, and only then call
 * the guarded method with that fulfillment. If the argument is a non-promise
 * value that already satisfies `M.nat()`, then the result of `await`ing it will
 * still pass, and  `M.callWhen` will still delay the guarded method call to a
 * future turn.
 * If the argument is a promise that rejects rather than fulfills, or if its
 * fulfillment does not satisfy the nested pattern, then the call is rejected
 * without ever invoking the guarded method.
 *
 * Any `AwaitArgGuard` may not appear as a rest pattern or a result pattern,
 * only a top-level single parameter pattern.
 *
 * @property {() => RawGuard} raw
 * In parameter position, pass this argument through without any hardening or checking.
 * In rest position, pass the rest of the arguments through without any hardening or checking.
 * In return position, return the result without any hardening or checking.
 */

/**
 * @typedef {PatternMatchers & GuardMakers} MatcherNamespace
 */

/** @typedef {(...args: any[]) => any} Method */

/**
 * @template {Record<PropertyKey, MethodGuard>} [T=Record<PropertyKey, MethodGuard>]
 * @typedef {{
 *   interfaceName: string,
 *   methodGuards:
 *     Omit<T, symbol> & Partial<{ [K in Extract<keyof T, symbol>]: never }>,
 *   symbolMethodGuards?:
 *     CopyMap<Extract<keyof T, symbol>, T[Extract<keyof T, symbol>]>,
 *   defaultGuards?: DefaultGuardType,
 *   sloppy?: boolean,
 * }} InterfaceGuardPayload
 */

/**
 * @template {Record<PropertyKey, MethodGuard>} [T=Record<PropertyKey, MethodGuard>]
 * @typedef {CopyTagged<'guard:interfaceGuard', InterfaceGuardPayload<T>>} InterfaceGuard
 */

/**
 * @typedef {MethodGuardOptional & MethodGuardRestReturns} MethodGuardMaker
 * A method name and parameter/return signature like:
 * ```js
 *   foo(a, b, c = d, ...e) => f
 * ```
 * should be guarded by something like:
 * ```js
 * {
 *   ...otherMethodGuards,
 *   foo: M.call(AShape, BShape).optional(CShape).rest(EShape).returns(FShape),
 * }
 * ```
/**
 * @typedef {object} MethodGuardReturns
 * @property {(returnGuard?: SyncValueGuard) => MethodGuard} returns
 * Arguments have been specified, now finish by creating a `MethodGuard`.
 * If the return guard is not `M.raw()`, the return value is automatically
 * hardened and must be Passable.
 */
/**
 * @typedef {object} MethodGuardRest
 * @property {(restArgGuard: SyncValueGuard) => MethodGuardReturns} rest
 * If the rest argument guard is not `M.raw()`, all rest arguments are
 * automatically hardened and must be Passable.
 */
/**
 * @typedef {MethodGuardRest & MethodGuardReturns} MethodGuardRestReturns
 * Mandatory and optional arguments have been specified, now specify `rest`, or
 * finish with `returns`.
 */
/**
 * @typedef {object} MethodGuardOptional
 * @property {(...optArgGuards: ArgGuard[]) => MethodGuardRestReturns} optional
 * Optional arguments not guarded with `M.raw()` are automatically hardened and
 * must be Passable.
 */

/**
 * @typedef {{
 *   callKind: 'sync' | 'async',
 *   argGuards: ArgGuard[],
 *   optionalArgGuards?: ArgGuard[],
 *   restArgGuard?: SyncValueGuard,
 *   returnGuard: SyncValueGuard,
 * }} MethodGuardPayload
 */

/**
 * @typedef {CopyTagged<'guard:methodGuard', MethodGuardPayload>} MethodGuard
 */

/**
 * @typedef {{
 *   argGuard: Pattern
 * }} AwaitArgGuardPayload
 */

/**
 * @typedef {CopyTagged<'guard:awaitArgGuard', AwaitArgGuardPayload>} AwaitArgGuard
 */

/**
 * @typedef {{}} RawGuardPayload
 */

/**
 * @typedef {CopyTagged<'guard:rawGuard', RawGuardPayload>} RawGuard
 */

/** @typedef {RawGuard | Pattern} SyncValueGuard */

/** @typedef {AwaitArgGuard | RawGuard | Pattern} ArgGuard */
