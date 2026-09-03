// `ConvertValToSlot` and its `val` parameter are the established public names in
// the @endo/marshal type surface; they are kept verbatim here.
import type { Passable, PassableCap } from '@endo/pass-style';

export type ConvertValToSlot<Slot, Value extends PassableCap = any> = (
  val: Value,
) => Slot;
export type ConvertSlotToVal<Slot, Value extends PassableCap = any> = (
  slot: Slot,
  iface?: string | undefined,
) => Value;
export type EncodingClass<T> = {
  '@qclass': T;
};
/**
 * Note that the '@@asyncIterator' encoding is deprecated. Use 'symbol' instead.
 *
 * The 'hilbert' encoding is a reference to the Hilbert Hotel
 * of https://www.ias.edu/ideas/2016/pires-hilbert-hotel .
 * It represents data that has its own '@qclass' property by separately storing
 * the `original` value of that property and
 * a `rest` record containing all other properties.
 */
export type EncodingUnion =
  | EncodingClass<'NaN'>
  | EncodingClass<'undefined'>
  | EncodingClass<'Infinity'>
  | EncodingClass<'-Infinity'>
  | (EncodingClass<'bigint'> & { digits: string })
  | EncodingClass<'@@asyncIterator'>
  | (EncodingClass<'symbol'> & { name: string })
  | (EncodingClass<'error'> & {
      name: string;
      message: string;
      errorId?: string;
      cause?: Encoding;
      errors?: Encoding[];
    })
  | (EncodingClass<'slot'> & { index: number; iface?: string })
  | (EncodingClass<'hilbert'> & { original: Encoding; rest?: Encoding })
  | (EncodingClass<'tagged'> & { tag: string; payload: Encoding });
export type EncodingElement = boolean | number | null | string | EncodingUnion;
export type TreeOf<T> =
  | T
  | {
      [x: PropertyKey]: TreeOf<T>;
    };
/**
 * The JSON-representable structure describing the complete shape and
 * pass-by-copy data of a Passable (i.e., everything except the contents of its
 * PassableCap leafs, which are marshalled into referenced Slots).
 *
 * '@qclass' is a privileged property name in our encoding scheme, so
 * it is disallowed in encoding records and any data that has such a property
 * must instead use the 'hilbert' encoding described above.
 */
export type Encoding = TreeOf<EncodingElement>;
export type CapData<Slot> = {
  /** A JSON.stringify of an Encoding. */
  body: string;
  slots: Slot[];
};
export type ToCapData<Slot> = (val: Passable) => CapData<Slot>;
/**
 * @returns a Passable. Typed as `any` rather than `Passable` because that is
 * more practical for callers, but the returned value is always a Passable.
 */
export type FromCapData<Slot> = (data: CapData<Slot>) => any;
export type Marshal<Slot> = {
  /** Use `toCapData`. */
  serialize: ToCapData<Slot>;
  /** Use `fromCapData`. */
  unserialize: FromCapData<Slot>;
  toCapData: ToCapData<Slot>;
  fromCapData: FromCapData<Slot>;
};
export type MakeMarshalOptions = {
  /**
   * controls whether serialized errors
   * also carry tagging information, made from `marshalName` and numbers
   * generated (currently by counting) starting at `errorIdNum`. The
   * `errorTagging` option defaults to `'on'`. Serialized
   * errors are also logged to `marshalSaveError` only if tagging is `'on'`.
   */
  errorTagging?: 'on' | 'off';
  /**
   * Used to identify sent errors.
   */
  marshalName?: string | undefined;
  /**
   * Ascending numbers staring from here
   * identify the sending of errors relative to this marshal instance.
   */
  errorIdNum?: number | undefined;
  /**
   * If `errorTagging` is
   * `'on'`, then errors serialized by this marshal instance are also
   * logged by calling `marshalSaveError` *after* `annotateError` associated
   * that error with its errorId. Thus, if `marshalSaveError` in turn logs
   * to the normal console, which is the default, then the console will
   * show that note showing the associated errorId.
   */
  marshalSaveError?: ((err: Error) => void) | undefined;
  /**
   * Formatting to use in the "body" property in objects returned from
   * `serialize`. The body string for each case:
   * * 'capdata' - a JSON string, from an encoding of passables
   * into JSON, where some values are represented as objects with a
   * `'@qclass` property.
   * * 'smallcaps' - a JSON string prefixed with `'#'`, which is
   * an unambiguous signal since a valid JSON string cannot begin with
   * `'#'`.
   */
  serializeBodyFormat?: 'capdata' | 'smallcaps';
};
/**
 * RankCover represents the inclusive lower bound and *inclusive* upper bound
 * of a string-comparison range that covers all possible encodings for
 * a set of values.
 */
export type RankCover = [string, string];
/**
 * The result of a `RankCompare` function that defines a rank-order, i.e.,
 * a total preorder in which different elements are always comparable but
 * can be tied for the same rank. See `RankCompare`.
 */
export type RankComparison = -1 | 0 | 1;
/**
 * Returns `-1`, `0`, or `1` depending on whether the rank of `left`
 * is respectively before, tied-with, or after the rank of `right`.
 *
 * As a total preorder, this comparison function is valid as an argument to
 * `Array.prototype.sort` but may return `0` to indicate that two
 * distinguishable elements such as `-0` and `0` are tied (i.e., are in the same
 * equivalence class for the purposes of this ordering). If each such
 * equivalence class is
 * a *rank* and ranks are disjoint, then this "rank order" is a true total order
 * over these ranks.
 *
 * This function establishes a total rank order over all passables.
 * To do so it makes arbitrary choices, such as that all strings
 * are after all numbers, and thus is not intended to be used directly as a
 * comparison with useful semantics.
 * However, it must be closely enough related to such comparisons to aid in
 * implementing lookups based on those comparisons.
 * For example, in order to get a total order over ranks, we put `NaN` after all
 * other JavaScript "number" values (i.e., IEEE 754 floating-point values) but
 * otherwise rank JavaScript numbers by signed magnitude, with `0` and `-0`
 * tied, as would a semantically useful ordering such as `KeyCompare` in
 * {@link @endo/patterns!}.
 * Likewise, an array sorted by rank would enable range queries by magnitude.
 */
export type RankCompare = (left: any, right: any) => RankComparison;
/**
 * A function that refines `RankCompare` into a total order over its inputs by
 * making arbitrary choices about the relative ordering of values within the
 * same rank.
 * Like `RankCompare` but even more strongly, it is expected to agree with a
 * `KeyCompare` (@see {@link @endo/patterns!}) where they overlap ---
 * `FullCompare(key1, key2) === 0` iff `KeyCompare(key1, key2) === 0`.
 */
export type FullCompare = RankCompare;
/**
 * The result of a `PartialCompare` function that defines a meaningful and
 * meaningfully precise partial order in which incomparable values are
 * represented by `NaN`. See `PartialCompare`. TypeScript has no `NaN` literal
 * type, so this necessarily widens to `number` rather than narrowing to the
 * three ordered results.
 */
export type PartialComparison = -1 | 0 | 1 | number;
/**
 * A function that implements a partial order --- defining relative position
 * between values but leaving some pairs incomparable (for example, subsets over
 * sets is a partial order in which {} precedes {x} and {y}, which are mutually
 * incomparable but both precede {x, y}). As with the rank ordering produced by
 * `RankCompare`, -1, 0, and 1 respectively mean "less than", "equivalent to",
 * and "greater than". NaN means "incomparable" --- the first value is not less,
 * equivalent, or greater than the second.
 *
 * By using NaN for "incomparable", the normal equivalence for using
 * the return value in a comparison is preserved.
 * `PartialCompare(left, right) >= 0` iff `left` is greater than or equivalent
 * to `right` in the partial ordering.
 */
export type PartialCompare<T = any> = (left: T, right: T) => PartialComparison;
