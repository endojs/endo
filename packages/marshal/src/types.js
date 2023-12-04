// @ts-check
export {};

/**
 * @template Slot
 * @callback ConvertValToSlot
 * @param {any} val
 * @returns {Slot}
 */

/**
 * @template Slot
 * @callback ConvertSlotToVal
 * @param {Slot} slot
 * @param {import('@endo/pass-style').InterfaceSpec=} iface
 * @returns {any}
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
 *           EncodingClass<'@@asyncIterator'> |
 *           EncodingClass<'symbol'> & { name: string } |
 *           EncodingClass<'error'> & { name: string,
 *                                      message: string,
 *                                      errorId?: string
 *           } |
 *           EncodingClass<'slot'> & { index: number,
 *                                     iface?: import('@endo/pass-style').InterfaceSpec
 *           } |
 *           EncodingClass<'hilbert'> & { original: Encoding,
 *                                        rest?: Encoding
 *           } |
 *           EncodingClass<'tagged'> & { tag: string,
 *                                       payload: Encoding
 *           }
 * } EncodingUnion
 *
 * Note that the '@@asyncIterator' encoding is deprecated. Use 'symbol' instead.
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
 * @returns {Passable}
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
 * logged by calling `marshalSaveError` *after* `assert.note` associated
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
 * This comparison function is valid as argument to
 * `Array.prototype.sort`. This is sometimes described as a "total order"
 * but, depending on your definitions, this is technically incorrect because
 * it may return `0` to indicate that two distinguishable elements such as
 * `-0` and `0` are tied (i.e., are in the same equivalence class
 * for the purposes of this ordering). If each such equivalence class is
 * a *rank* and ranks are disjoint, then this "rank order" is a
 * true total order over these ranks. In mathematics this goes by several
 * other names such as "total preorder".
 *
 * This function establishes a total rank order over all passables.
 * To do so it makes arbitrary choices, such as that all strings
 * are after all numbers. Thus, this order is not intended to be
 * used directly as a comparison with useful semantics. However, it must be
 * closely enough related to such comparisons to aid in implementing
 * lookups based on those comparisons. For example, in order to get a total
 * order among ranks, we put `NaN` after all other JavaScript "number" values
 * (i.e., IEEE 754 floating-point values). But otherwise, we rank JavaScript
 * numbers by signed magnitude, with `0` and `-0` tied. A semantically useful
 * ordering would also compare magnitudes, and so agree with the rank ordering
 * of all values other than `NaN`. An array sorted by rank would enable range
 * queries by magnitude.
 * @param {import('@endo/pass-style').Passable} left
 * @param {import('@endo/pass-style').Passable} right
 * @returns {RankComparison}
 */

/**
 * @typedef {RankCompare} FullCompare
 * A `FullCompare` function satisfies all the invariants stated below for
 * `RankCompare`'s relation with KeyCompare.
 * In addition, its equality is as precise as the `KeyCompare`
 * comparison defined below, in that, for all Keys `x` and `y`,
 * `FullCompare(x, y) === 0` iff `KeyCompare(x, y) === 0`.
 *
 * For non-keys a `FullCompare` should be exactly as imprecise as
 * `RankCompare`. For example, both will treat all errors as in the same
 * equivalence class. Both will treat all promises as in the same
 * equivalence class. Both will order taggeds the same way, which is admittedly
 * weird, as some taggeds will be considered keys and other taggeds will be
 * considered non-keys.
 */
