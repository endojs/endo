// @ts-nocheck TODO Fix the recursive types to it checks. Will this
// require a .d.ts file? I don't know.

/// <reference path="extra-types.d.ts" />

export {};

/**
 * @typedef { "undefined" | "null" |
 *   "boolean" | "number" | "bigint" | "string" | "symbol"
 * } PrimitiveStyle
 */

/**
 * @typedef { PrimitiveStyle |
 *   "copyRecord" | "copyArray" | "tagged" |
 *   "remotable" |
 *   "error" | "promise"
 * } PassStyle
 */

// TODO declare more precise types throughout this file, so the type system
// and IDE can be more helpful.

/**
 * @typedef {*} Passable
 *
 * A Passable value that may be marshalled. It is classified as one of
 * PassStyle. A Passable must be hardened.
 *
 * A Passable has a pass-by-copy superstructure. This includes
 *    * the atomic pass-by-copy primitives ("undefined" | "null" |
 *      "boolean" | "number" | "bigint" | "string" | "symbol"),
 *    * the pass-by-copy containers
 *      ("copyRecord" | "copyArray" | "tagged") that
 *      contain other Passables,
 *    * and the special cases ("error" | "promise").
 *
 * A Passable's pass-by-copy superstructure ends in
 * PassableCap leafs ("remotable" | "promise"). Since a
 * Passable is hardened, its structure and classification is stable --- its
 * structure and classification cannot change even if some of the objects are
 * proxies.
 */

/**
 * @callback PassStyleOf
 * @param {Passable} passable
 * @returns {PassStyle}
 */

/**
 * @typedef {Passable} PureData
 *
 * A Passable is PureData when its pass-by-copy superstructure whose
 * nodes are pass-by-copy composites (CopyArray, CopyRecord, Tagged) leaves are
 * primitives or empty composites. No remotables, promises, or errors.
 *
 * This check assures purity *given* that none of these pass-by-copy composites
 * can be a Proxy. TODO SECURITY BUG we plan to enforce this, giving these
 * pass-by-copy composites much of the same security properties as the
 * proposed Records and Tuples (TODO need link).
 *
 * Given this (currently counter-factual) assumption, a PureData value cannot
 * be used as a communications channel,
 * and can therefore be safely shared with subgraphs that should not be able
 * to communicate with each other.
 */

/**
 * @typedef {Passable} Remotable
 * Might be an object explicitly declared to be `Remotable` using the
 * `Far` or `Remotable` functions, or a remote presence of a Remotable.
 */

/**
 * @typedef {Promise | Remotable} PassableCap
 * The leaves of a Passable's pass-by-copy superstructure.
 */

/**
 * @template T
 * @typedef {T[]} CopyArray
 */

/**
 * @template T
 * @typedef {Record<string, T>} CopyRecord
 */

/**
 * @typedef {{
 *   [PASS_STYLE]: 'tagged',
 *   [Symbol.toStringTag]: string,
 *   payload: Passable
 * }} CopyTagged
 *
 * The tag is the value of the `[String.toStringTag]` property.
 */

// /////////////////////////////////////////////////////////////////////////////

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

// /////////////////////////////////////////////////////////////////////////////

/**
 * @typedef {string} InterfaceSpec
 * This is an interface specification.
 * For now, it is just a string, but will eventually be `PureData`. Either
 * way, it must remain pure, so that it can be safely shared by subgraphs that
 * are not supposed to be able to communicate.
 */

/**
 * @callback MarshalGetInterfaceOf
 * Simple semantics, just tell what interface (or undefined) a remotable has.
 * @param {*} maybeRemotable the value to check
 * @returns {InterfaceSpec|undefined} the interface specification, or undefined
 * if not a deemed to be a Remotable
 */

/**
 * @callback Checker
 * Internal to a useful pattern for writing checking logic
 * (a "checkFoo" function) that can be used to implement a predicate
 * (an "isFoo" function) or a validator (an "assertFoo" function).
 *
 *    * A predicate ideally only returns `true` or `false` and rarely throws.
 *    * A validator throws an informative diagnostic when the predicate
 *      would have returned `false`, and simply returns `undefined` normally
 *      when the predicate would have returned `true`.
 *    * The internal checking function that they share is parameterized by a
 *      `Checker` that determines how to proceed with a failure condition.
 *      Predicates pass in an identity function as checker. Validators
 *      pass in `assertChecker` which is a trivial wrapper around `assert`.
 *
 * See the various uses for good examples.
 * @param {boolean} cond
 * @param {Details=} details
 * @returns {boolean}
 */

/**
 * @typedef {[string, string]} RankCover
 * RankCover represents the inclusive lower bound and *inclusive* upper bound
 * of a string-comparison range that covers all possible encodings for
 * a set of values.
 */
