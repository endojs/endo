// @ts-nocheck TODO Fix the recursive types to it checks. Will this
// require a .d.ts file? I don't know.

/// <reference path="extra-types.d.ts" />

export {};

/**
 * @template Slot
 * @callback ConvertValToSlot
 * @param {PassableCap} val
 * @returns {Slot}
 */

/**
 * @template Slot
 * @callback ConvertSlotToVal
 * @param {Slot} slot
 * @param {InterfaceSpec=} iface
 * @returns {PassableCap}
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
 *           EncodingClass<'slot'> & { index: number, iface?: InterfaceSpec } |
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
 * @typedef {Record<Exclude<string, '@qclass'>, Encoding>} EncodingRecord
 *
 * '@qclass' is a privileged property name in our encoding scheme, so
 * it is disallowed in encoding records and any data that has such a property
 * must instead use the 'hilbert' encoding described above.
 */

/**
 * @typedef {boolean | number | null | string | EncodingUnion | EncodingRecord} EncodingElement
 */

/**
 * @typedef {EncodingElement | NestedArray<EncodingElement>} Encoding
 *
 * The JSON-representable structure describing the complete shape and
 * pass-by-copy data of a Passable (i.e., everything except the contents of its
 * PassableCap leafs, which are marshalled into referenced Slots).
 */

/**
 * @template Slot
 * @typedef {Object} CapData
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
 * @typedef {Object} Marshal
 * @property {ToCapData<Slot>} serialize
 * @property {FromCapData<Slot>} unserialize
 */

/**
 * @typedef {Object} MakeMarshalOptions
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

// /////////////////////// Type reexports @endo/pass-style /////////////////////

/** @typedef {import('@endo/pass-style').Checker} Checker */
/** @typedef {import('@endo/pass-style').PassStyle} PassStyle */
/** @typedef {import('@endo/pass-style').Passable} Passable */
/** @typedef {import('@endo/pass-style').Remotable} Remotable */
/** @template T @typedef {import('@endo/pass-style').CopyArray<T>} CopyArray */
/** @template T @typedef {import('@endo/pass-style').CopyRecord<T>} CopyRecord */
/** @typedef {import('@endo/pass-style').InterfaceSpec} InterfaceSpec */
