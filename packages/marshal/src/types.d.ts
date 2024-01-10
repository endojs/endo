/* eslint-disable no-use-before-define */
export {};

export type ConvertValToSlot<Slot> = (
  val: import('@endo/pass-style').PassableCap,
) => Slot;

export type ConvertSlotToVal<Slot> = (
  slot: Slot,
  iface?: string,
) => import('@endo/pass-style').PassableCap;

export type EncodingClass<T> = { '@qclass': T };

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
    })
  | (EncodingClass<'slot'> & { index: number; iface?: string })
  | (EncodingClass<'hilbert'> & { original: Encoding; rest?: Encoding })
  | (EncodingClass<'tagged'> & { tag: string; payload: Encoding });

/*
 * Note that the '@@asyncIterator' encoding is deprecated. Use 'symbol' instead.
 *
 * The 'hilbert' encoding is a reference to the Hilbert Hotel
 * of https://www.ias.edu/ideas/2016/pires-hilbert-hotel .
 * It represents data that has its own '@qclass' property by separately storing
 * the `original` value of that property and
 * a `rest` record containing all other properties.
 */

export type EncodingElement = boolean | number | null | string | EncodingUnion;

export type TreeOf<T> = T | { [x: PropertyKey]: TreeOf<T> };

/**
 * The JSON-representable structure describing the complete shape and
 * pass-by-copy data of a Passable (i.e., everything except the contents of its
 * PassableCap leafs, which are marshalled into referenced Slots).
 *
 * '@qclass' is a privileged property name in our encoding scheme, so
 * it is disallowed in encoding records and any data that has such a property
 * must instead use the 'hilbert' encoding described above.
 */
type Encoding = TreeOf<EncodingElement>;

export type CapData<Slot> = {
  body: string; // A JSON.stringify of an Encoding
  slots: Slot[]; // slots
};

/**
 * @param val a Passable
 */
export type ToCapData<Slot> = (val: any) => CapData<Slot>;

/**
 * @returns a Passable
 */
export type FromCapData<Slot> = (data: CapData<Slot>) => any;

export type Marshal<Slot> = {
  serialize: ToCapData<Slot>; // use toCapData
  unserialize: FromCapData<Slot>; // use fromCapData
  toCapData: ToCapData<Slot>;
  fromCapData: FromCapData<Slot>;
};

export type MakeMarshalOptions = {
  errorTagging?: 'on' | 'off'; //  controls whether serialized errors
  //   also carry tagging information, made from `marshalName` and numbers
  //   generated (currently by counting) starting at `errorIdNum`. The
  //   `errorTagging` option defaults to `'on'`. Serialized
  //   errors are also logged to `marshalSaveError` only if tagging is `'on'`.
  marshalName?: string; //  Used to identify sent errors.
  errorIdNum?: number; //  Ascending numbers staring from here
  //   identify the sending of errors relative to this marshal instance.
  marshalSaveError?: (err: Error) => void; //  If `errorTagging` is
  //   `'on'`, then errors serialized by this marshal instance are also
  //   logged by calling `marshalSaveError` *after* `assert.note` associated
  //   that error with its errorId. Thus, if `marshalSaveError` in turn logs
  //   to the normal console, which is the default, then the console will
  //   show that note showing the associated errorId.
  serializeBodyFormat?: 'capdata' | 'smallcaps';
  //   Formatting to use in the "body" property in objects returned from
  //   `serialize`. The body string for each case:
  //  * 'capdata' - a JSON string, from an encoding of passables
  //    into JSON, where some values are represented as objects with a
  //    `'@qclass` property.
  //  * 'smallcaps' - a JSON string prefixed with `'#'`, which is
  //    an unambiguous signal since a valid JSON string cannot begin with
  //    `'#'`.
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
 * @param  left a Passable
 * @param  right a Passable
 */
export type RankCompare = (left: any, right: any) => RankComparison;

/**
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
export type FullCompare = RankCompare;
