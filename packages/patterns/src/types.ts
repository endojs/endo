/* eslint-disable no-use-before-define */

import type {
  Checker,
  CopyArray,
  CopyRecord,
  CopyTagged,
  PassStyle,
  Passable,
  RankCompare,
} from '@endo/marshal';

export type {
  Checker,
  CopyArray,
  CopyRecord,
  CopyTagged,
  PassStyle,
  Passable,
  RankCompare,
  RankCover,
} from '@endo/marshal';

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
 * The same two Keys, passed to another location, will be `keyEQ` there iff
 * they are `keyEQ` here. (`keyEQ` tests equality according to the
 * key distributed equality semantics.)
 */
export type Key = Passable;
export type GetRankCover = (
  payload: Passable,
  encodePassable: KeyToDBKey,
) => import('@endo/marshal').RankCover;
export type KeyToDBKey = (key: Key) => string;
/**
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
export type Pattern = Passable;
/**
 * A Passable collection of Keys that are all mutually distinguishable
 * according to the key distributed equality semantics exposed by `keyEQ`.
 */
export type CopySet<K extends unknown = any> = CopyTagged & {
  [Symbol.toStringTag]: 'copySet';
  payload: Array<K>;
};
/**
 * A Passable collection of entries with Keys that are all mutually distinguishable
 * according to the key distributed equality semantics exposed by `keyEQ`,
 * each with a corresponding positive cardinality.
 */
export type CopyBag<K extends unknown = any> = CopyTagged & {
  [Symbol.toStringTag]: 'copyBag';
  payload: Array<[K, bigint]>;
};
/**
 * A Passable collection of entries with Keys that are all mutually distinguishable
 * according to the key distributed equality semantics exposed by `keyEQ`,
 * each with a corresponding Passable value.
 */
export type CopyMap<
  K extends unknown = any,
  V extends unknown = any,
> = CopyTagged & {
  [Symbol.toStringTag]: 'copyMap';
  payload: {
    keys: Array<K>;
    values: Array<V>;
  };
};
/**
 * A Pattern representing the predicate characterizing a category of Passables,
 * such as strings or 8-bit unsigned integer numbers or CopyArrays of Remotables.
 */
export type Matcher<T extends string> = CopyTagged<`match:${T}`> & {
  [Symbol.toStringTag]: `match:${string}`;
};
/**
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
export type FullCompare = RankCompare;
export type RankComparatorKit = {
  comparator: RankCompare;
  antiComparator: RankCompare;
};
export type FullComparatorKit = {
  comparator: FullCompare;
  antiComparator: FullCompare;
};
/**
 * The result of a `KeyCompare` function that defines a meaningful
 * and meaningfully precise partial order of Key values. See `KeyCompare`.
 */
export type KeyComparison = -1 | 0 | 1 | number;
/**
 * `compareKeys` implements a partial order over keys. As with the
 * rank ordering produced by `compareRank`, -1, 0, and 1 mean
 * "less than", "equivalent to", and "greater than" respectively.
 * NaN means "incomparable" --- the first key is not less, equivalent,
 * or greater than the second. For example, subsets over sets is
 * a partial order.
 *
 * By using NaN for "incomparable", the normal equivalence for using
 * the return value in a comparison is preserved.
 * `compareKeys(left, right) >= 0` iff `left` is greater than or
 * equivalent to `right` in the partial ordering.
 *
 * Key order (a partial order) and rank order (a total preorder) are
 * co-designed so that we store Passables in rank order and index into them
 * with keys for key-based queries. To keep these distinct, when speaking
 * informally about rank, we talk about "earlier" and "later". When speaking
 * informally about keys, we talk about "smaller" and "bigger".
 *
 * In both orders, the return-0 case defines
 * an equivalence class, i.e., those that are tied for the same place in the
 * order. The global invariant that we need between the two orders is that the
 * key order equivalence class is always at least as precise as the
 * rank order equivalence class. IOW, if `compareKeys(X,Y) === 0` then
 * `compareRank(X,Y) === 0`. But not vice versa. For example, two different
 * remotables are the same rank but incomparable as keys.
 *
 * A further invariant is if `compareKeys(X,Y) < 0` then
 * `compareRank(X,Y) < 0`, i.e., if X is smaller than Y in key order, then X
 * must be earlier than Y in rank order. But not vice versa.
 * X can be equivalent to or earlier than Y in rank order and still be
 * incomparable with Y in key order. For example, the record `{b: 3, a: 5}` is
 * earlier than the record `{b: 5, a: 3}` in rank order but they are
 * incomparable as keys. And two distinct remotables such as `Far('X', {})` and
 * `Far('Y', {})` are equivalent in rank order but incomparable as Keys.
 *
 * This lets us translate a range search over the
 * partial key order into a range search over rank order followed by filtering
 * out those that don't match. To get this effect, we store the elements of
 * a set in an array sorted in reverse rank order, from later to earlier.
 * Combined with our lexicographic comparison of arrays, if set X is a subset
 * of set Y then the array representing set X will be an earlier rank that the
 * array representing set Y.
 */
export type KeyCompare = (left: Key, right: Key) => KeyComparison;
export type CheckPattern = (
  allegedPattern: Passable,
  check: Checker,
) => boolean;
export type AllLimits = {
  decimalDigitsLimit: number;
  stringLengthLimit: number;
  symbolNameLengthLimit: number;
  numPropertiesLimit: number;
  propertyNameLengthLimit: number;
  arrayLengthLimit: number;
  numSetElementsLimit: number;
  numUniqueBagElementsLimit: number;
  numMapEntriesLimit: number;
};
export type Limits = Partial<AllLimits>;
export type PatternMatchers = {
  /**
   * Matches any Passable.
   */
  any: () => Matcher<'any'>;
  /**
   * Matches against the intersection of all sub-Patterns.
   */
  and: (...subPatts: Pattern[]) => Matcher<'and'>;
  /**
   * Matches against the union of all sub-Patterns
   * (requiring a successful match against at least one).
   */
  or: (...subPatts: Pattern[]) => Matcher<'or'>;
  /**
   * Matches against the negation of the sub-Pattern.
   */
  not: (subPatt: Pattern) => Matcher<'not'>;
  /**
   * Matches any Passable primitive value or Remotable.
   * All matched values are Keys.
   */
  scalar: () => Matcher<'scalar'>;
  /**
   * Matches any value that can be a key in a CopyMap
   * or an element in a CopySet or CopyBag.
   * All matched values are also valid Patterns that match only themselves.
   */
  key: () => Matcher<'key'>;
  /**
   * Matches any Pattern that can be used to characterize Passables.
   * A Pattern cannot contain promises or errors,
   * as these are not stable enough to usefully match.
   */
  pattern: () => Matcher<'pattern'>;
  /**
   * When `kind` specifies a PassStyle other than "tagged",
   * matches any value having that PassStyle.
   * Otherwise, when `kind` specifies a known tagged record tag
   * (such as 'copySet', 'copyBag', 'copyMap', or 'match:scalar'),
   * matches any CopyTagged with that tag and a valid tag-specific payload.
   * Otherwise, does not match any value.
   * TODO: Reject attempts to create a kind matcher with unknown `kind`?
   */
  kind: (kind: PassStyle | string) => Matcher<'kind'>;
  /**
   * Matches `true` or `false`.
   */
  boolean: () => Matcher<'kind'>;
  /**
   * Matches any floating point number,
   * including `NaN` and either signed Infinity.
   */
  number: () => Matcher<'kind'>;
  /**
   * Matches any bigint, subject to limits.
   */
  bigint: (limits?: Limits) => Matcher<'bigint'>;
  /**
   * Matches any non-negative bigint, subject to limits.
   */
  nat: (limits?: Limits) => Matcher<'nat'>;
  /**
   * Matches any string, subject to limits.
   */
  string: (limits?: Limits) => Matcher<'string'>;
  /**
   * Matches any registered or well-known symbol,
   * subject to limits.
   */
  symbol: (limits?: Limits) => Matcher<'symbol'>;
  /**
   * Matches any CopyRecord, subject to limits.
   */
  record: (limits?: Limits) => Matcher<'recordOf'>;
  /**
   * Matches any CopyArray, subject to limits.
   */
  array: (limits?: Limits) => Matcher<'arrayOf'>;
  /**
   * Matches any CopySet, subject to limits.
   */
  set: (limits?: Limits) => Matcher<'setOf'>;
  /**
   * Matches any CopyBag, subject to limits.
   */
  bag: (limits?: Limits) => Matcher<'bagOf'>;
  /**
   * Matches any CopyMap, subject to limits.
   */
  map: (limits?: Limits) => Matcher<'mapOf'>;
  /**
   * Matches a far object or its remote presence.
   * The optional `label` is purely for diagnostic purposes and does not
   * add any constraints.
   */
  remotable: (label?: string) => Matcher<'kind'>;
  /**
   * Matches any error object.
   * Error objects are Passable, but are neither Keys nor Patterns.
   * They do not have a useful identity.
   */
  error: () => Matcher<'kind'>;
  /**
   * Matches any promise object.
   * Promises are Passable, but are neither Keys nor Patterns.
   * They do not have a useful identity.
   */
  promise: () => Matcher<'kind'>;
  /**
   * Matches the exact value `undefined`.
   * All keys including `undefined` are already valid Patterns and
   * so can validly represent themselves.
   * But optional Pattern arguments `(patt = undefined) => ...`
   * treat explicit `undefined` as omission of the argument.
   * Thus, when a passed Pattern does not also need to be a Key,
   * we recommend passing `M.undefined()` rather than `undefined`.
   */
  undefined: () => Matcher<'kind'>;
  /**
   * Returns `null`, which matches only itself.
   */
  null: () => null;
  /**
   * Matches any value that compareKeys reports as less than rightOperand.
   */
  lt: (rightOperand: Key) => Matcher<'lt'>;
  /**
   * Matches any value that compareKeys reports as less than or equal to
   * rightOperand.
   */
  lte: (rightOperand: Key) => Matcher<'lte'>;
  /**
   * Matches any value that is equal to key.
   */
  eq: (key: Key) => Matcher<'eq'>;
  /**
   * Matches any value that is not equal to key.
   */
  neq: (key: Key) => Matcher<'not'>;
  /**
   * Matches any value that compareKeys reports as greater than or equal
   * to rightOperand.
   */
  gte: (rightOperand: Key) => Matcher<'gte'>;
  /**
   * Matches any value that compareKeys reports as greater than
   * rightOperand.
   */
  gt: (rightOperand: Key) => Matcher<'gt'>;
  /**
   * Matches any CopyArray whose elements are all matched by `subPatt`
   * if defined, subject to limits.
   */
  arrayOf: (subPatt?: Pattern, limits?: Limits) => Matcher<'arrayOf'>;
  /**
   * Matches any CopyRecord whose keys are all matched by `keyPatt`
   * if defined and values are all matched by `valuePatt` if defined,
   * subject to limits.
   */
  recordOf: (
    keyPatt?: Pattern,
    valuePatt?: Pattern,
    limits?: Limits,
  ) => Matcher<'recordOf'>;
  /**
   * Matches any CopySet whose elements are all matched by `keyPatt`
   * if defined, subject to limits.
   */
  setOf: (keyPatt?: Pattern, limits?: Limits) => Matcher<'setOf'>;
  /**
   * Matches any CopyBag whose elements are all matched by `keyPatt`
   * if defined and the cardinality of each is matched by `countPatt`
   * if defined, subject to limits.
   * `countPatt` is expected to rarely be useful,
   * but is provided to minimize surprise.
   */
  bagOf: (
    keyPatt?: Pattern,
    countPatt?: Pattern,
    limits?: Limits,
  ) => Matcher<'bagOf'>;
  /**
   * Matches any CopyMap whose keys are all matched by `keyPatt` if defined
   * and values are all matched by `valuePatt` if defined,
   * subject to limits.
   */
  mapOf: (
    keyPatt?: Pattern,
    valuePatt?: Pattern,
    limits?: Limits,
  ) => Matcher<'mapOf'>;
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
  splitArray: (
    required: Pattern[],
    optional?: Pattern[],
    rest?: Pattern,
  ) => Matcher<'splitArray'>;
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
  splitRecord: (
    required: CopyRecord<Pattern>,
    optional?: CopyRecord<Pattern>,
    rest?: Pattern,
  ) => Matcher<'splitRecord'>;
  /**
   * Deprecated. Use `M.splitArray` or `M.splitRecord` instead.
   * An array or record is split into the first part that is matched by
   * `basePatt`, and the remainder, which is matched against `rest` if present.
   */
  split: (
    basePatt: CopyRecord<any> | CopyArray<any>,
    rest?: Pattern,
  ) => Matcher<'splitArray' | 'splitRecord'>;
  /**
   * Deprecated. Use `M.splitArray` or `M.splitRecord` instead.
   * An array or record is split into the first part that is matched by
   * `basePatt`, and the remainder, which is matched against `rest` if present.
   * `M.partial` differs from `M.split` in the handling of data that is
   * described in `basePatt` but absent in a provided specimen:
   *   - For a CopyRecord, `M.partial` ignores properties of `basePatt`
   *     that are not present on the specimen.
   *   - For a CopyArray, `M.partial` ignores elements of `basePatt`
   *     at indices beyond the maximum index of the specimen.
   */
  partial: (
    basePatt: CopyRecord<any> | CopyArray<any>,
    rest?: Pattern,
  ) => Matcher<'splitArray' | 'splitRecord'>;
  /**
   * Matches any Passable that is either matched by `subPatt` or is a promise object.
   * Note that validation is immediate, so (unlike the TypeScript ERef<T>
   * type) `M.eref` matches a promise object whose fulfillment value is
   * _not_ matched by `subPatt`.
   * For describing a top-level parameter,
   * `M.callWhen(..., M.await(p), ...)` is preferred over `M.call(..., M.eref(p), ...)`
   * because the former always checks against the sub-Pattern (awaiting fulfillment
   * if necessary) while the latter bypasses such checks when the relevant argument
   * is a promise.
   */
  eref: (subPatt: Pattern) => Pattern;
  /**
   * Matches any Passable that is matched by `subPatt` or is the exact value `undefined`.
   */
  opt: (subPatt: Pattern) => Pattern;
};
export type MakeInterfaceGuard = {
  <M extends Record<any, MethodGuard>>(
    interfaceName: string,
    methodGuards: M,
    options?: {
      sloppy?: false;
    },
  ): InterfaceGuard<M>;
  (
    interfaceName: string,
    methodGuards: any,
    options?: {
      sloppy?: true;
    },
  ): InterfaceGuard<any>;
};
export type GuardMakers = {
  /**
   * Guard an interface to a far object or facet
   */
  interface: MakeInterfaceGuard;
  /**
   * Guard a synchronous call
   */
  call: (...argGuards: ArgGuard[]) => MethodGuardMaker;
  /**
   * Guard an async call
   */
  callWhen: (...argGuards: ArgGuard[]) => MethodGuardMaker;
  /**
   * Guard an await
   */
  await: (argGuard: ArgGuard) => ArgGuard;
};
export type MatcherNamespace = PatternMatchers & GuardMakers;
export type Method = (...args: any[]) => any;
export type InterfaceGuard<
  T extends Record<string | symbol, MethodGuard> = Record<
    string | symbol,
    MethodGuard
  >,
> = {
  klass: 'Interface';
  interfaceName: string;
  methodGuards: T;
  sloppy?: boolean;
};
/**
 * A method name and parameter/return signature like:
 * ```js
 * foo(a, b, c = d, ...e) => f
 * ```
 * should be guarded by something like:
 * ```js
 * {
 * ...otherMethodGuards,
 * foo: M.call(AShape, BShape).optional(CShape).rest(EShape).returns(FShape),
 * }
 * ```
 */
export type MethodGuardMaker = any;
export type MethodGuard = {
  klass: 'methodGuard';
  callKind: 'sync' | 'async';
  returnGuard: unknown;
};
export type ArgGuard = any;
export type PatternKit = {
  checkMatches: (
    specimen: Passable,
    patt: Passable,
    check: Checker,
    label?: string | number,
  ) => boolean;
  matches: (specimen: Passable, patt: Pattern) => boolean;
  mustMatch: (
    specimen: Passable,
    patt: Pattern,
    label?: string | number,
  ) => void;
  assertPattern: (patt: Pattern) => void;
  isPattern: (patt: Passable) => boolean;
  getRankCover: GetRankCover;
  M: MatcherNamespace;
};
