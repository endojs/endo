// @ts-check
export {};

/** @import {Passable, PassableCap} from '@endo/pass-style' */

/**
 * @template Slot
 * @template {PassableCap} [Value=any]
 * @callback ConvertValToSlot
 * @param {Value} val
 * @returns {Slot}
 */

/**
 * @template Slot
 * @template {PassableCap} [Value=any]
 * @callback ConvertSlotToVal
 * @param {Slot} slot
 * @param {string} [iface]
 * @returns {Value}
 */

/**
 * @template T
 * @typedef {{ '@qclass': T }} EncodingClass
 */

/**
 * @typedef {EncodingClass<'NaN'> |
 *           EncodingClass<'undefined'> |
 *           EncodingClass<'Infinity'> |
 *           EncodingClass<'-Infinity'> |
 *           EncodingClass<'bigint'> & { digits: string } |
 *           EncodingClass<'error'> & { name: string,
 *                                      message: string,
 *                                      errorId?: string,
 *                                      cause?: Encoding,
 *                                      errors?: Encoding[],
 *           } |
 *           EncodingClass<'slot'> & { index: number,
 *                                     iface?: string
 *           } |
 *           EncodingClass<'hilbert'> & { original: Encoding,
 *                                        rest?: Encoding
 *           } |
 *           EncodingClass<'tagged'> & { tag: string,
 *                                       payload: Encoding
 *           }
 * } EncodingUnion
 *
 * Note that the '@@asyncIterator' and 'symbol' encodings are no longer
 * supported.
 *
 * The 'hilbert' encoding is a reference to the Hilbert Hotel
 * of https://www.ias.edu/ideas/2016/pires-hilbert-hotel .
 * It represents data that has its own '@qclass' property by separately storing
 * the `original` value of that property and
 * a `rest` record containing all other properties.
 */

/**
 * @typedef {boolean | number | null | string | EncodingUnion} EncodingElement
 */

/**
 * @template T
 * @typedef {T | { [x: PropertyKey]: TreeOf<T> }} TreeOf
 */

/**
 * @typedef {TreeOf<EncodingElement>} Encoding
 *
 * The JSON-representable structure describing the complete shape and
 * pass-by-copy data of a Passable (i.e., everything except the contents of its
 * PassableCap leafs, which are marshalled into referenced Slots).
 *
 * '@qclass' is a privileged property name in our encoding scheme, so
 * it is disallowed in encoding records and any data that has such a property
 * must instead use the 'hilbert' encoding described above.
 */

/**
 * @template Slot
 * @typedef {object} CapData
 * @property {string} body A JSON.stringify of an Encoding
 * @property {Slot[]} slots
 */

/**
 * @template Slot
 * @callback ToCapData
 * @param {Passable} val
 * @returns {CapData<Slot>}
 */

/**
 * @template Slot
 * @callback FromCapData
 * @param {CapData<Slot>} data
 * @returns {any} a Passable
 */

/**
 * @template Slot
 * @typedef {object} Marshal
 * @property {ToCapData<Slot>} serialize use toCapData
 * @property {FromCapData<Slot>} unserialize use fromCapData
 * @property {ToCapData<Slot>} toCapData
 * @property {FromCapData<Slot>} fromCapData
 */

/**
 * @typedef {object} MakeMarshalOptions
 * @property {'on'|'off'} [errorTagging] controls whether serialized errors
 * also carry tagging information, made from `marshalName` and numbers
 * generated (currently by counting) starting at `errorIdNum`. The
 * `errorTagging` option defaults to `'on'`. Serialized
 * errors are also logged to `marshalSaveError` only if tagging is `'on'`.
 * @property {string=} marshalName Used to identify sent errors.
 * @property {number=} errorIdNum Ascending numbers staring from here
 * identify the sending of errors relative to this marshal instance.
 * @property {(err: Error) => void=} marshalSaveError If `errorTagging` is
 * `'on'`, then errors serialized by this marshal instance are also
 * logged by calling `marshalSaveError` *after* `annotateError` associated
 * that error with its errorId. Thus, if `marshalSaveError` in turn logs
 * to the normal console, which is the default, then the console will
 * show that note showing the associated errorId.
 * @property {'capdata'|'smallcaps'} [serializeBodyFormat]
 * Formatting to use in the "body" property in objects returned from
 * `serialize`. The body string for each case:
 *    * 'capdata' - a JSON string, from an encoding of passables
 *      into JSON, where some values are represented as objects with a
 *      `'@qclass` property.
 *    * 'smallcaps' - a JSON string prefixed with `'#'`, which is
 *      an unambiguous signal since a valid JSON string cannot begin with
 *      `'#'`.
 */

/**
 * @typedef {[string, string]} RankCover
 * RankCover represents the inclusive lower bound and *inclusive* upper bound
 * of a string-comparison range that covers all possible encodings for
 * a set of values.
 */

/**
 * @typedef {-1 | 0 | 1} RankComparison
 * The result of a `RankCompare` function that defines a rank-order, i.e.,
 * a total preorder in which different elements are always comparable but
 * can be tied for the same rank. See `RankCompare`.
 */

/**
 * @callback RankCompare
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
 * {@link ../../patterns}.
 * Likewise, an array sorted by rank would enable range queries by magnitude.
 *
 * @param {any} left
 * @param {any} right
 * @returns {RankComparison}
 */

/**
 * @typedef {RankCompare} FullCompare
 * A function that refines `RankCompare` into a total order over its inputs by
 * making arbitrary choices about the relative ordering of values within the
 * same rank.
 * Like `RankCompare` but even more strongly, it is expected to agree with a
 * `KeyCompare` (@see {@link ../../patterns}) where they overlap ---
 * `FullCompare(key1, key2) === 0` iff `KeyCompare(key1, key2) === 0`.
 */

/**
 * @typedef {-1 | 0 | 1 | NaN} PartialComparison
 * The result of a `PartialCompare` function that defines a meaningful and
 * meaningfully precise partial order in which incomparable values are
 * represented by `NaN`. See `PartialCompare`.
 */

/**
 * @template [T=any]
 * @callback PartialCompare
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
 *
 * @param {T} left
 * @param {T} right
 * @returns {PartialComparison}
 */
