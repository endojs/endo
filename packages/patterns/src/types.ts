/// <reference types="ses"/>
/* eslint-disable no-use-before-define */

import type { Rejector } from '@endo/errors/rejector.js';
import type { RemotableBrand } from '@endo/eventual-send';
import type {
  CopyArray,
  CopyRecord,
  CopyTagged,
  Passable,
  PassStyle,
  Atom,
  RemotableObject,
} from '@endo/pass-style';
import type {
  PartialCompare,
  PartialComparison,
  RankCover,
} from '@endo/marshal';

export type { FullCompare } from '@endo/marshal';

/**
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
 * The same two Keys, passed to another location, will be {@link keyEQ} there iff
 * they are {@link keyEQ} here. ({@link keyEQ} tests equality according to the
 * key distributed equality semantics.)
 *
 * ### Rank order and key order
 *
 * The "key order" of `compareKeys` implements a partial order over Keys --- it defines relative position between two Keys but leaves some pairs incomparable (for example, subsets over sets is a partial order in which {} precedes {x} and {y}, which are mutually incomparable but both precede {x, y}).
 * It is co-designed with the "rank order" (a total preorder) of `compareRank` from [`@endo/marshal`](https://www.npmjs.com/package/@endo/marshal) to support efficient range search for Key-based queries (for example, finding all entries in a map for which the key is a CopyRecord with particular fields can be implemented by selecting from rank-ordered keys those that are CopyRecords whose lexicographically greatest field is at least as big as the lexicographically greatest required field, and then filtering out matched keys that don't have the necessary shape).
 * Both functions use `-1`, `0`, and `1` to respectively mean "less than", "equivalent to", and "greater than".
 * `NaN` means "incomparable" --- the first key is not less than, equivalent to, or greater than the second.
 * To keep the orders distinct when speaking informally, we use "earlier" and "later" for rank order, and "smaller" and "bigger" for key order.
 *
 * The key ordering of `compareKeys` refines the rank ordering of `compareRank` but leaves gaps for which a more complete "full order" relies upon rank ordering:
 * 1. `compareKeys(X,Y) === 0` implies that `compareRank(X,Y) === 0` --- if X
 *    is equivalent to Y in key order, then X is equivalent to Y in rank order.
 *    But the converse does not hold; for example, Remotables `Far('X')` and
 *    `Far('Y')` are equivalent in rank order but incomparable in key order.
 * 2. `compareKeys(X,Y) < 0` implies that `compareRank(X,Y) < 0` --- if X is
 *    smaller than Y in key order, then X is earlier than Y in rank order.
 *    But the converse does not hold; for example, the record `{b: 3, a: 5}`
 *    is earlier than the record `{b: 5, a: 3}` in rank order but they are
 *    incomparable in key order.
 * 3. `compareRank(X,Y) === 0` implies that `compareKeys(X,Y)` is either
 *    0 or NaN --- Keys within the same rank are either equivalent to or
 *    incomparable to each other in key order. But the converse does not hold;
 *    for example, `Far('X')` and `{}` are incomparable in key order but not
 *    equivalent in rank order.
 * 4. `compareRank(X,Y) === 0` and `compareRank(X,Z) === 0` imply that
 *    `compareKeys(X,Y)` and `compareKeys(X,Z)` are the same --- all Keys within
 *    the same rank are either mutually equivalent or mutually incomparable, and
 *    in fact only in the mutually incomparable case can the rank be said to
 *    contain more than one key.
 */
export type Key = Exclude<
  Passable<RemotableObject | RemotableBrand<any, any>, never>,
  Error | Promise<any>
>;

export type ScalarKey = Atom | RemotableObject | RemotableBrand<any, any>;

export type KeyToDBKey = (key: Key) => string;
export type GetRankCover = (
  payload: Passable,
  encodePassable: KeyToDBKey,
) => RankCover;

/**
 * Patterns are Passable arbitrarily-nested pass-by-copy containers
 * (CopyArray, CopyRecord, CopySet, CopyBag, CopyMap) in which every
 * non-container leaf is either a Key or a {@link Matcher}, or such leaves in
 * isolation with no container.
 *
 * A Pattern acts as a declarative total predicate over Passables, where each
 * Passable is either matched or not matched by it. Every {@link Key} is also a Pattern
 * that matches only "itself", i.e., Keys that are {@link keyEQ} to it according to
 * the key distributed equality semantics.
 *
 * Patterns cannot contain promises or errors, as these do
 * not have useful distributed equality or matching semantics. Likewise,
 * no Pattern can distinguish among promises, or distinguish among errors.
 * Patterns also cannot contain any CopyTaggeds except for those recognized as
 * {@link CopySet}s, {@link CopyBag}s, {@link CopyMap}s, or {@link Matcher}s.
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
export type Pattern = Exclude<Passable, Error | Promise<any>>;

/**
 * A Passable collection of Keys that are all mutually distinguishable
 * according to the key distributed equality semantics exposed by {@link keyEQ}.
 */
export type CopySet<K extends Key = Key> = CopyTagged<'copySet', K[]>;

/**
 * A Passable collection of entries with Keys that are all mutually distinguishable
 * according to the key distributed equality semantics exposed by {@link keyEQ},
 * each with a corresponding positive cardinality.
 */
export type CopyBag<K extends Key = Key> = CopyTagged<'copyBag', [K, bigint][]>;

/**
 * A Passable collection of entries with Keys that are all mutually distinguishable
 * according to the key distributed equality semantics exposed by {@link keyEQ},
 * each with a corresponding Passable value.
 */
export type CopyMap<
  K extends Key = Key,
  V extends Passable = Passable,
> = CopyTagged<'copyMap', { keys: K[]; values: V[] }>;

/**
 * CopySet, CopyBag, and CopyMap all store Keys in reverse rankOrder,
 * which supports generalized utilities.
 */
export type KeyCollection = CopySet | CopyBag | CopyMap;

/**
 * A Pattern representing the predicate characterizing a category of Passables,
 * such as strings or 8-bit unsigned integer numbers or CopyArrays of Remotables.
 */
export type Matcher = CopyTagged<`match:${string}`, Passable>;

/**
 * A Matcher with a specific tag and payload type, for type-level inference.
 * `MatcherOf<'string', T>` represents a string matcher carrying type hint `T`.
 */
export type MatcherOf<
  Tag extends string,
  Payload extends Passable = any,
> = CopyTagged<`match:${Tag}`, Payload>;

/**
 * The result of a `KeyCompare` function that defines a meaningful
 * and meaningfully precise partial order of Key values. See `KeyCompare`.
 */
export type KeyComparison = PartialComparison;

/**
 * A function that implements a partial order over Keys.
 * Key order (a partial order) and rank order (a total preorder) are
 * co-designed to support efficient range search for Key-based queries
 * (@see {@link @endo/patterns!#rank-order-and-key-order}).
 */
export type KeyCompare = PartialCompare<Key>;

export type ConfirmPattern = (
  allegedPattern: Passable,
  reject: Rejector,
) => boolean;

export type AllLimits = {
  decimalDigitsLimit: number;
  stringLengthLimit: number;
  symbolNameLengthLimit: number;
  numPropertiesLimit: number;
  propertyNameLengthLimit: number;
  arrayLengthLimit: number;
  byteLengthLimit: number;
  numSetElementsLimit: number;
  numUniqueBagElementsLimit: number;
  numMapEntriesLimit: number;
};

export type Limits = Partial<AllLimits>;

/**
 * It is either a PassStyle other than 'tagged', or, if the underlying
 * PassStyle is 'tagged', then the `getTag` value for tags that are
 * recognized at the @endo/patterns level of abstraction. For each of those
 * tags, a tagged record only has that kind if it satisfies the invariants
 * that the @endo/patterns level associates with that kind.
 */
export type Kind =
  | Exclude<PassStyle, 'tagged'>
  | 'copySet'
  | 'copyBag'
  | 'copyMap'
  | `match:${string}`
  | `guard:${string}`;

/**
 * Matchers for characterizing Passables and compound shapes.
 */
export type PatternMatchers = {
  /**
   * Matches any Passable.
   */
  any: () => MatcherOf<'any'>;

  /**
   * Matches against the intersection of all sub-Patterns.
   */
  and: <P extends Pattern[]>(...subPatts: P) => MatcherOf<'and', P>;

  /**
   * Matches against the union of all sub-Patterns
   * (requiring a successful match against at least one).
   */
  or: <P extends Pattern[]>(...subPatts: P) => MatcherOf<'or', P>;

  /**
   * Matches against the negation of the sub-Pattern.
   */
  not: (subPatt: Pattern) => MatcherOf<'not'>;

  /**
   * Matches any Passable primitive value or Remotable.
   * All matched values are Keys.
   */
  scalar: () => MatcherOf<'scalar'>;

  /**
   * Matches any value that can be a key in a CopyMap
   * or an element in a CopySet or CopyBag.
   * All matched values are also valid Patterns that match only themselves.
   */
  key: () => MatcherOf<'key'>;

  /**
   * Matches any Pattern that can be used to characterize Passables.
   * A Pattern cannot contain promises or errors,
   * as these are not stable enough to usefully match.
   */
  pattern: () => MatcherOf<'pattern'>;

  /**
   * When `kind` specifies a PassStyle other than "tagged",
   * matches any value having that PassStyle.
   * Otherwise, when `kind` specifies a known tagged record tag
   * (such as 'copySet', 'copyBag', 'copyMap', or 'match:scalar'),
   * matches any CopyTagged with that tag and a valid tag-specific payload.
   * Otherwise, does not match any value.
   * TODO: Reject attempts to create a kind matcher with unknown `kind`?
   */
  kind: <K extends string>(kind: K) => MatcherOf<'kind', K>;

  /**
   * For matching an arbitrary Passable Tagged object, whether it has a
   * recognized kind or not. If `tagPatt` is omitted, it defaults to
   * `M.string()`. If `payloadPatt` is omitted, it defaults to
   * `M.any()`.
   */
  tagged: <TP extends Pattern = Pattern, PP extends Pattern = Pattern>(
    tagPatt?: TP,
    payloadPatt?: PP,
  ) => MatcherOf<'tagged', [TP, PP]>;

  /**
   * Matches `true` or `false`.
   */
  boolean: () => MatcherOf<'kind', 'boolean'>;

  /**
   * Matches any floating point number,
   * including `NaN` and either signed Infinity.
   */
  number: <T extends number = number>() => MatcherOf<'number', T>;

  /**
   * Matches any bigint, subject to limits.
   */
  bigint: <T extends bigint = bigint>(
    limits?: Limits,
  ) => MatcherOf<'bigint', T>;

  /**
   * Matches any non-negative bigint, subject to limits.
   */
  nat: <T extends bigint = bigint>(limits?: Limits) => MatcherOf<'nat', T>;

  /**
   * Matches any string, subject to limits.
   */
  string: <T extends string = string>(
    limits?: Limits,
  ) => MatcherOf<'string', T>;

  /**
   * Matches any registered or well-known symbol,
   * subject to limits.
   */
  symbol: <T extends symbol = symbol>(
    limits?: Limits,
  ) => MatcherOf<'symbol', T>;

  /**
   * Matches any CopyRecord, subject to limits.
   */
  record: (limits?: Limits) => MatcherOf<'kind', 'copyRecord'>;

  /**
   * Matches any CopyArray, subject to limits.
   */
  array: (limits?: Limits) => MatcherOf<'kind', 'copyArray'>;

  /**
   * Matches any ByteArray, subject to limits.
   */
  byteArray: (limits?: Limits) => MatcherOf<'kind', 'byteArray'>;

  /**
   * Matches any CopySet, subject to limits.
   */
  set: (limits?: Limits) => MatcherOf<'kind', 'copySet'>;

  /**
   * Matches any CopyBag, subject to limits.
   */
  bag: (limits?: Limits) => MatcherOf<'kind', 'copyBag'>;

  /**
   * Matches any CopyMap, subject to limits.
   */
  map: (limits?: Limits) => MatcherOf<'kind', 'copyMap'>;

  /**
   * Matches a far object or its remote presence.
   * The optional `label` is purely for diagnostic purposes and does not
   * add any constraints.
   *
   * For facet-isolated return types in exo kits, pass an InterfaceGuard
   * as the type parameter:
   * ```ts
   * const PublicI = M.interface('Public', {
   *   getData: M.call().returns(M.string()),
   * });
   * const AdminI = M.interface('Admin', {
   *   getPublic: M.call().returns(M.remotable<typeof PublicI>('Public')),
   * });
   * // TypeFromMethodGuard of getPublic → () => { getData: () => string } & RemotableObject
   * ```
   */
  remotable: <T extends Passable = RemotableObject | RemotableBrand<any, any>>(
    label?: string,
  ) => MatcherOf<'remotable', T>;

  /**
   * Matches any error object.
   * Error objects are Passable, but are neither Keys nor Patterns.
   * They do not have a useful identity.
   */
  error: () => MatcherOf<'kind', 'error'>;

  /**
   * Matches any promise object.
   * Promises are Passable, but are neither Keys nor Patterns.
   * They do not have a useful identity.
   */
  // TODO: add `label?: string` to align with `M.remotable` — requires a matching
  // runtime change in patternMatchers.js.  Tracked separately from this type-only PR.
  promise: <T extends Passable = any>() => MatcherOf<'promise', T>;

  /**
   * Matches the exact value `undefined`.
   * All keys including `undefined` are already valid Patterns and
   * so can validly represent themselves.
   * But optional Pattern arguments `(patt = undefined) => ...`
   * treat explicit `undefined` as omission of the argument.
   * Thus, when a passed Pattern does not also need to be a Key,
   * we recommend passing `M.undefined()` rather than `undefined`.
   */
  undefined: () => MatcherOf<'kind', 'undefined'>;

  /**
   * Returns `null`, which matches only itself.
   */
  null: () => null;

  /**
   * Matches any value that compareKeys reports as less than rightOperand.
   */
  lt: (rightOperand: Key) => MatcherOf<'lt', Key>;

  /**
   * Matches any value that compareKeys reports as less than or equal to
   * rightOperand.
   */
  lte: (rightOperand: Key) => MatcherOf<'lte', Key>;

  /**
   * Matches any value that is equal to key.
   */
  eq: (key: Key) => MatcherOf<'eq', Key>;

  /**
   * Matches any value that is not equal to key.
   */
  neq: (key: Key) => MatcherOf<'neq', Key>;

  /**
   * Matches any value that compareKeys reports as greater than or equal
   * to rightOperand.
   */
  gte: (rightOperand: Key) => MatcherOf<'gte', Key>;

  /**
   * Matches any value that compareKeys reports as greater than
   * rightOperand.
   */
  gt: (rightOperand: Key) => MatcherOf<'gt', Key>;

  /**
   * Matches any CopyArray whose elements are all matched by `subPatt`
   * if defined, subject to limits.
   */
  arrayOf: <P extends Pattern = Pattern>(
    subPatt?: P,
    limits?: Limits,
  ) => MatcherOf<'arrayOf', P>;

  /**
   * Matches any CopyRecord whose keys are all matched by `keyPatt`
   * if defined and values are all matched by `valuePatt` if defined,
   * subject to limits.
   */
  recordOf: <KP extends Pattern = Pattern, VP extends Pattern = Pattern>(
    keyPatt?: KP,
    valuePatt?: VP,
    limits?: Limits,
  ) => MatcherOf<'recordOf', [KP, VP]>;

  /**
   * Matches any CopySet whose elements are all matched by `keyPatt`
   * if defined, subject to limits.
   */
  setOf: <KP extends Pattern = Pattern>(
    keyPatt?: KP,
    limits?: Limits,
  ) => MatcherOf<'setOf', KP>;

  /**
   * Matches any CopyBag whose elements are all matched by `keyPatt`
   * if defined and the cardinality of each is matched by `countPatt`
   * if defined, subject to limits.
   * `countPatt` is expected to rarely be useful,
   * but is provided to minimize surprise.
   */
  bagOf: <KP extends Pattern = Pattern>(
    keyPatt?: KP,
    countPatt?: Pattern,
    limits?: Limits,
  ) => MatcherOf<'bagOf', KP>;

  /**
   * Matches any array, CopySet, or CopyBag in which the bigint number of
   * elements that match `elementPatt` is >= `bound` (which defaults to `1n`).
   */
  containerHas: (
    elementPatt?: Pattern,
    bound?: bigint,
    limits?: Limits,
  ) => MatcherOf<'containerHas'>;

  /**
   * Matches any CopyMap whose keys are all matched by `keyPatt` if defined
   * and values are all matched by `valuePatt` if defined,
   * subject to limits.
   */
  mapOf: <KP extends Pattern = Pattern, VP extends Pattern = Pattern>(
    keyPatt?: KP,
    valuePatt?: VP,
    limits?: Limits,
  ) => MatcherOf<'mapOf', [KP, VP]>;

  /**
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
   */
  splitArray: <
    Req extends Pattern[] = Pattern[], // widest: any patterns (not [] — that would mean "no required")
    Opt extends Pattern[] = [], // narrowest: no optional elements when omitted
    Rest extends Pattern = never, // narrowest: no rest matching when omitted
  >(
    required: [...Req],
    optional?: [...Opt],
    rest?: Rest,
  ) => MatcherOf<'splitArray', [Req, Opt, Rest]>;

  /**
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
   */
  splitRecord: <
    Req extends CopyRecord<Pattern> = CopyRecord<Pattern>,
    Opt extends CopyRecord<Pattern> = {},
    Rest extends Pattern = never,
  >(
    required: Req,
    optional?: Opt,
    rest?: Rest,
  ) => MatcherOf<'splitRecord', [Req, Opt, Rest]>;

  /**
   * An array or record is split into the first part that is matched by
   * `basePatt`, and the remainder, which is matched against `rest` if present.
   * @deprecated Use `M.splitArray` or `M.splitRecord` instead.
   */
  split: (
    basePatt: CopyRecord<any> | CopyArray<any>,
    rest?: Pattern,
  ) => Matcher;

  /**
   * An array or record is split into the first part that is matched by
   * `basePatt`, and the remainder, which is matched against `rest` if present.
   * `M.partial` differs from `M.split` in the handling of data that is
   * described in `basePatt` but absent in a provided specimen:
   *   - For a CopyRecord, `M.partial` ignores properties of `basePatt`
   *     that are not present on the specimen.
   *   - For a CopyArray, `M.partial` ignores elements of `basePatt`
   *     at indices beyond the maximum index of the specimen.
   * @deprecated Use `M.splitArray` or `M.splitRecord` instead.
   */
  partial: (
    basePatt: CopyRecord<any> | CopyArray<any>,
    rest?: Pattern,
  ) => Matcher;

  /**
   * Matches any Passable that is either matched by `subPatt` or is a promise object.
   * Note that validation is immediate, so (unlike the TypeScript `ERef<T>`
   * type) `M.eref` matches a promise object whose fulfillment value is
   * _not_ matched by `subPatt`.
   * For describing a top-level parameter,
   * `M.callWhen(..., M.await(p), ...)` is preferred over `M.call(..., M.eref(p), ...)`
   * because the former always checks against the sub-Pattern (awaiting fulfillment
   * if necessary) while the latter bypasses such checks when the relevant argument
   * is a promise.
   */
  eref: <P extends Pattern>(
    subPatt: P,
  ) => MatcherOf<'or', [P, MatcherOf<'promise'>]>;

  /**
   * Matches any Passable that is matched by `subPatt` or is the exact value `undefined`.
   */
  // opt(P) desugars to M.or(P, M.undefined()), i.e. "P | undefined".
  // MatcherOf<'kind', 'undefined'> is the internal form of M.undefined().
  opt: <P extends Pattern>(
    subPatt: P,
  ) => MatcherOf<'or', [P, MatcherOf<'kind', 'undefined'>]>;
};

/**
 * Default guard choice for method guards: undefined, 'passable', or 'raw'.
 */
export type DefaultGuardType = undefined | 'passable' | 'raw';

/**
 * Overload for strictly-typed interface guards (no sloppy mode).
 */
export type MakeInterfaceGuardStrict = <
  M extends Record<PropertyKey, MethodGuard>,
>(
  interfaceName: string,
  methodGuards: M,
  options: {
    defaultGuards?: undefined;
    /**
     * @deprecated This has no effect.
     */
    sloppy?: false;
  },
) => InterfaceGuard<M>;

/**
 * Overload for sloppy interface guards (looser typing).
 * @deprecated Use {@link MakeInterfaceGuardStrict} or {@link MakeInterfaceGuardGeneral} instead.
 */
export type MakeInterfaceGuardSloppy = (
  interfaceName: string,
  methodGuards: any,
  options: {
    defaultGuards?: 'passable' | 'raw';
    /**
     * @deprecated Use `defaultGuards: undefined` instead.
     */
    sloppy?: true;
  },
) => InterfaceGuard<any>;

/**
 * General overload for interface guards.
 */
export type MakeInterfaceGuardGeneral = <
  M extends Record<PropertyKey, MethodGuard>,
>(
  interfaceName: string,
  methodGuards: M,
  options?: {
    defaultGuards?: DefaultGuardType;
    /**
     * @deprecated Use `defaultGuards` instead.
     */
    sloppy?: boolean;
  },
) => InterfaceGuard<M>;

/**
 * Callable that constructs interface guards (union of overloads).
 */
export type MakeInterfaceGuard = MakeInterfaceGuardStrict &
  MakeInterfaceGuardSloppy &
  MakeInterfaceGuardGeneral;

/**
 * Makers for guards: interface, call/callWhen, await, and raw passthrough.
 */
export type GuardMakers = {
  /**
   * Guard the interface of an exo object.
   */
  interface: MakeInterfaceGuard;

  /**
   * Guard a synchronous call. Arguments not guarded by `M.raw()` are
   * automatically hardened and must be at least Passable.
   */
  call: <A extends SyncValueGuard[]>(
    ...argPatterns: A
  ) => MethodGuardMaker<'sync', A>;

  /**
   * Guard an async call. Arguments not guarded by `M.raw()` are automatically
   * hardened and must be at least Passable.
   */
  callWhen: <A extends ArgGuard[]>(
    ...argGuards: A
  ) => MethodGuardMaker<'async', A>;

  /**
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
   */
  await: <P extends Pattern>(argPattern: P) => AwaitArgGuard<P>;

  /**
   * In parameter position, pass this argument through without any hardening or checking.
   * In rest position, pass the rest of the arguments through without any hardening or checking.
   * In return position, return the result without any hardening or checking.
   */
  raw: () => RawGuard;
};

/**
 * Public namespace combining pattern matchers and guard makers.
 */
export type MatcherNamespace = PatternMatchers & GuardMakers;

/** A generic method function. */
export type Method = (...args: any[]) => any;

/**
 * Payload for an interface guard definition.
 */
export type InterfaceGuardPayload<
  T extends Record<PropertyKey, MethodGuard> = Record<PropertyKey, MethodGuard>,
> = {
  interfaceName: string;
  methodGuards: Omit<T, symbol> &
    Partial<{ [K in Extract<keyof T, symbol>]: never }>;
  symbolMethodGuards?: CopyMap<
    Extract<keyof T, symbol>,
    T[Extract<keyof T, symbol>]
  >;
  defaultGuards?: DefaultGuardType;
  /**
   * @deprecated Use `defaultGuards` instead.
   */
  sloppy?: boolean;
};

/**
 * Characterize dynamic behavior such as method argument/response signatures and promise awaiting.
 *
 * The {@link @endo/exo!} package uses `InterfaceGuard`s as the first level of
 * defense for Exo objects against malformed input.
 *
 * For example:
 *
 * ```js
 * const AsyncSerializerI = M.interface('AsyncSerializer', {
 *   // This interface has a single method, which is async as indicated by M.callWhen().
 *   // The method accepts a single argument, consumed with an implied `await` as indicated by M.await(),
 *   // and the result of that implied `await` is allowed to fulfill to any value per M.any().
 *   // The method result is a string as indicated by M.string(),
 *   // which is inherently wrapped in a promise by the async nature of the method.
 *   getStringOf: M.callWhen(M.await(M.any())).returns(M.string()),
 * });
 * const asyncSerializer = makeExo('AsyncSerializer', AsyncSerializerI, {
 *   // M.callWhen() delays invocation of this method implementation
 *   // while provided argument is in a pending state
 *   // (i.e., it is a promise that has not yet settled).
 *   getStringOf(val) { return String(val); },
 * });
 *
 * const stringP = asyncSerializer.getStringOf(Promise.resolve(42n));
 * isPromise(stringP); // => true
 * await stringP; // => "42"
 * ```
 */
export type InterfaceGuard<
  T extends Record<PropertyKey, MethodGuard> = Record<PropertyKey, MethodGuard>,
> = CopyTagged<'guard:interfaceGuard', InterfaceGuardPayload<T>>;

/**
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
 */
export type RawGuardPayload = {};

/**
 * Raw passthrough guard with no hardening or checking.
 */
export type RawGuard = CopyTagged<'guard:rawGuard', RawGuardPayload>;

/** Guard for a synchronous value position (raw or Pattern). */
export type SyncValueGuard = RawGuard | Pattern;

export type AwaitArgGuardPayload<P extends Pattern = Pattern> = {
  argGuard: P;
};

/**
 * Guard that awaits a positional argument (for async calls).
 */
export type AwaitArgGuard<P extends Pattern = Pattern> = CopyTagged<
  'guard:awaitArgGuard',
  AwaitArgGuardPayload<P>
>;

/** Guard for any argument position (await, raw, or Pattern). */
export type ArgGuard = AwaitArgGuard | RawGuard | Pattern;

export type MethodGuardPayload<
  CK extends 'sync' | 'async' = 'sync' | 'async',
  Args extends ArgGuard[] = ArgGuard[],
  OptArgs extends ArgGuard[] = ArgGuard[],
  RetGuard extends SyncValueGuard = SyncValueGuard,
> = {
  callKind: CK;
  argGuards: Args;
  optionalArgGuards?: OptArgs;
  restArgGuard?: SyncValueGuard;
  returnGuard: RetGuard;
};

export type CopyTaggedMethodGuard = CopyTagged<
  'guard:methodGuard',
  MethodGuardPayload
>;

/**
 * Guard for a method's call signature and return type.
 * Generic parameters carry type-level information for inference via
 * `TypeFromMethodGuard`.
 */
export type MethodGuard<
  CK extends 'sync' | 'async' = 'sync' | 'async',
  Args extends ArgGuard[] = ArgGuard[],
  OptArgs extends ArgGuard[] = ArgGuard[],
  RetGuard extends SyncValueGuard = SyncValueGuard,
> = CopyTagged<
  'guard:methodGuard',
  MethodGuardPayload<CK, Args, OptArgs, RetGuard>
>;

/**
 * Arguments have been specified, now finish by creating a `MethodGuard`.
 * If the return guard is not `M.raw()`, the return value is automatically
 * hardened and must be Passable.
 */
export type MethodGuardReturns<
  CK extends 'sync' | 'async' = 'sync' | 'async',
  Args extends ArgGuard[] = ArgGuard[],
  OptArgs extends ArgGuard[] = ArgGuard[],
> = {
  returns: <RG extends SyncValueGuard = MatcherOf<'any'>>(
    returnGuard?: RG,
  ) => MethodGuard<CK, Args, OptArgs, RG>;
};

/**
 * If the rest argument guard is not `M.raw()`, all rest arguments are
 * automatically hardened and must be Passable.
 */
export type MethodGuardRest<
  CK extends 'sync' | 'async' = 'sync' | 'async',
  Args extends ArgGuard[] = ArgGuard[],
  OptArgs extends ArgGuard[] = ArgGuard[],
> = {
  rest: (restArgGuard: SyncValueGuard) => MethodGuardReturns<CK, Args, OptArgs>;
};

/**
 * Mandatory and optional arguments have been specified, now specify `rest`, or
 * finish with `returns`.
 */
export type MethodGuardRestReturns<
  CK extends 'sync' | 'async' = 'sync' | 'async',
  Args extends ArgGuard[] = ArgGuard[],
  OptArgs extends ArgGuard[] = ArgGuard[],
> = MethodGuardRest<CK, Args, OptArgs> & MethodGuardReturns<CK, Args, OptArgs>;

/**
 * Optional arguments not guarded with `M.raw()` are automatically hardened and
 * must be Passable.
 */
export type MethodGuardOptional<
  CK extends 'sync' | 'async' = 'sync' | 'async',
  Args extends ArgGuard[] = ArgGuard[],
> = {
  optional: <OA extends ArgGuard[]>(
    ...optArgGuards: OA
  ) => MethodGuardRestReturns<CK, Args, OA>;
};

/**
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
 */
export type MethodGuardMaker<
  CK extends 'sync' | 'async' = 'sync' | 'async',
  Args extends ArgGuard[] = ArgGuard[],
> = MethodGuardOptional<CK, Args> & MethodGuardRestReturns<CK, Args>;
