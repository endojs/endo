// eslint-disable-next-line spaced-comment
/// <reference path="extra-types.d.ts" />

/**
 * @typedef { "bigint" | "boolean" | "null" | "number" | "string" | "symbol" | "undefined" | "copyArray" | "copyRecord" | "copyError" | "promise" | "presence" } PassStyle
 * TODO "presence" above should indirect through REMOTE_STYLE to prepare
 * for changing it to "remotable"
 */

// TODO declare more precise types throughout this file, so the type system
// and IDE can be more helpful.

/**
 * @typedef {*} Passable
 *
 * A Passable value that may be marshalled. It is classified as one of
 * PassStyle. A Passable must be hardened.
 *
 * A Passable has a pass-by-copy superstructure. This includes the atomic
 * pass-by-copy primitives ("bigint" | "boolean" | "null" | "number" |
 * "string" | "undefined") and the composite pass-by-copy objects ("copyArray" |
 * "copyRecord" | "copyError"). The composite pass-by-copy objects that may
 * contain other Passables.
 *
 * A Passable's pass-by-copy superstructure ends in PassableCap leaves. The
 * Passable can be further classified by the nature of these leaves. Since a
 * Passable is hardened, its structure and classification is stable --- its
 * structure and classification cannot change even if some of the objects are
 * proxies.
 */

/**
 * @typedef {Passable} Comparable
 *
 * A Comparable is a Passable in which none of the leaves of the pass-by-copy
 * superstructure are promises. Two Comparables may be compared by
 * for equivalence according to `sameStructure`, which is the strongest
 * equivalence class supported by marshal's distributed object semantics.
 */

/**
 * @typedef {Comparable} OnlyData
 *
 * A Comparable is OnlyData when its pass-by-copy superstructure has no leaves,
 * i.e., when all the leaves of the data structure tree are primitive data
 * types or empty composites.
 */

/**
 * @typedef {OnlyData} PureData
 *
 * An OnlyData value is PureData when it contains no hidden mutable state,
 * e.g., when none of its pass-by-copy composite data objects are proxies. This
 * cannot be determined by inspection. It can only be achieved by trusted
 * construction. A PureData value cannot be used as a communications channel,
 * and can therefore be safely shared with subgraphs that should not be able
 * to communicate with each other.
 */

/**
 * @typedef {*} Remotable
 * Might be an object explicitly deemed to be `Remotable`, an object inferred
 * to be Remotable, or a remote presence of a Remotable.
 */

/**
 * @typedef {Promise | Remotable} PassableCap
 * The leaves of a Passable's pass-by-copy superstructure.
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
 * EncodingClass<'undefined'> |
 * EncodingClass<'Infinity'> |
 * EncodingClass<'-Infinity'> |
 * EncodingClass<'bigint'> & { digits: string } |
 * EncodingClass<'@@asyncIterator'> |
 * EncodingClass<'ibid'> & { index: number } |
 * EncodingClass<'error'> & { name: string, message: string, errorId?: string } |
 * EncodingClass<'slot'> & { index: number, iface?: InterfaceSpec } |
 * EncodingClass<'hilbert'> & { original: Encoding, rest?: Encoding }} EncodingUnion
 * @typedef {{ [index: string]: Encoding, '@qclass'?: undefined }} EncodingRecord
 * We exclude '@qclass' as a property in encoding records.
 * @typedef {EncodingUnion | null | string | boolean | number | EncodingRecord} EncodingElement
 */

/**
 * @typedef {EncodingElement | NestedArray<EncodingElement>} Encoding
 * The JSON structure that the data portion of a Passable serializes to.
 *
 * The QCLASS 'hilbert' is a reference to the Hilbert Hotel
 * of https://www.ias.edu/ideas/2016/pires-hilbert-hotel
 * If QCLASS appears as a property name in the data, we encode it instead
 * as a QCLASS record of type 'hilbert'. To do so, we must move the other
 * parts of the record into fields of the hilbert record.
 */

/**
 * @template Slot
 * @typedef CapData
 * @property {Encoding} body
 * @property {Slot[]} slots
 */

/**
 * @template Slot
 * @callback Serialize
 * @param {Passable} val
 * @returns {CapData<Slot>}
 */

/**
 * @typedef {"allowCycles" | "warnOfCycles" | "forbidCycles"} CyclePolicy
 */

/**
 * @template Slot
 * @callback Unserialize
 * @param {CapData<Slot>} data
 * @param {CyclePolicy=} cyclePolicy
 * @returns {Passable}
 */

/**
 * @template Slot
 * @typedef Marshal
 * @property {Serialize<Slot>} serialize
 * @property {Unserialize<Slot>} unserialize
 */

/**
 * @template Slot
 * @callback MakeMarshal
 * @param {ConvertValToSlot=} convertValToSlot
 * @param {ConvertSlotToVal=} convertSlotToVal
 * @param {MakeMarshalOptions=} options
 * @returns {Marshal}
 */

/**
 * @typedef MakeMarshalOptions
 * @property {'on'|'off'=} errorTagging controls whether serialized errors
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
 */

// /////////////////////////////////////////////////////////////////////////////

/**
 * @typedef {string} InterfaceSpec
 * This is an interface specification.
 * For now, it is just a string, but will eventually be any OnlyData. Either
 * way, it must remain pure, so that it can be safely shared by subgraphs that
 * are not supposed to be able to communicate.
 */

/**
 * @callback MarshalGetInterfaceOf
 * Simple semantics, just tell what interface (or undefined) a remotable has.
 *
 * @param {*} maybeRemotable the value to check
 * @returns {InterfaceSpec|undefined} the interface specification, or undefined
 * if not a deemed to be a Remotable
 */
