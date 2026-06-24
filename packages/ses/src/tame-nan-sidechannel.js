import {
  RangeError,
  dataViewPrototype,
  MAX_SAFE_INTEGER,
  apply,
  defineProperty,
  entries,
  getOwnPropertyDescriptor,
  hasOwn,
  is,
  max,
  trunc,
  uncurryThis,
} from './commons.js';

/**
 * These `FERAL*` methods open up the NaN side-channel on some platforms,
 * like v8. Thus, we need to encapsulate them and replace them with wrappers
 * that canonicalize NaNs.
 */
const {
  setFloat16: FERAL_SET_FLOAT16,
  setFloat32: FERAL_SET_FLOAT32,
  setFloat64: FERAL_SET_FLOAT64,

  setUint16,
  setUint32,
  setBigUint64,
} = dataViewPrototype;

const dataViewGetBuffer = uncurryThis(
  // @ts-expect-error we know it is there on all conforming platforms
  getOwnPropertyDescriptor(dataViewPrototype, 'buffer').get,
);

/**
 * See https://webidl.spec.whatwg.org/#js-unrestricted-double which implies
 * that this is the canonical NaN for web standards.
 * Casual googling strongly suggests that this is also the cosmWasm
 * canonical NaN. But I have not yet found an authoritative page stating this.
 *
 * As noted there, WebIDL choses this value because
 * > The `NaN` value ... is chosen simply because it is the quiet NaN
 * > with the lowest value when its bit pattern is interpreted as an 64-bit
 * > unsigned integer.
 *
 * See https://github.com/endojs/endo/pull/3214#discussion_r3155852021
 */
const canonicalNaN64Encoding = 0x7ff8_0000_0000_0000n;

/**
 * As of this writing (April 29, 2026) all implementations agree that a
 * ***literal*** `NaN` seems to encode in 32 bits as `0x7fc00000`.
 * See https://github.com/endojs/endo/pull/3214#discussion_r3162974396
 *
 * Applying WebIDL's rationale for the 64 bit float
 * > The `NaN` value ... is chosen simply because it is the quiet NaN
 * > with the lowest value when its bit pattern is interpreted as an 64-bit
 * > unsigned integer.
 *
 * to the 32 bit case agrees with the choice the implementations make
 * for the 32 bit encoding of a ***literal*** `NaN`.
 *
 * See https://github.com/endojs/endo/pull/3214#discussion_r3155852021
 */
const canonicalNaN32Encoding = 0x7fc0_0000;

/**
 * As of this writing (April 29, 2026) all implementations that implement
 * float16 (with the almost surely unintentional exception of QuickJS),
 * agree that a ***literal*** `NaN` seems to encode in 16 bits as `0x7e00`.
 * See https://github.com/endojs/endo/pull/3214#discussion_r3162974396
 *
 * Applying WebIDL's rationale for the 64 bit float
 * > The `NaN` value ... is chosen simply because it is the quiet NaN
 * > with the lowest value when its bit pattern is interpreted as an 64-bit
 * > unsigned integer.
 *
 * to the 16 bit case agrees with the choice those implementations make
 * for the 16 bit encoding of a ***literal*** `NaN`.
 *
 * See https://github.com/endojs/endo/pull/3214#discussion_r3155852021
 */
const canonicalNaN16Encoding = 0x7e00;

/**
 * Perform `RequireInternalSlot(obj, [[DataView]])` as needed in
 * SetViewValue.
 * https://tc39.es/ecma262/multipage/structured-data.html#sec-setviewvalue
 * https://tc39.es/ecma262/#sec-get-dataview.prototype.buffer
 *
 * @param {unknown} obj
 * @returns {void}
 */
const requireDataView = obj => {
  dataViewGetBuffer(obj);
};

/**
 * Emulate the internal `ToIndex` from
 * https://tc39.es/ecma262/multipage/abstract-operations.html#sec-toindex
 *
 * @param {unknown} v
 * @returns {number}
 */
const toIndex = v => {
  // @ts-expect-error Math.trunc uses the internal `ToNumber` to coerce its
  // argument, whatever it is, to an integer number.
  const n = trunc(v);
  if (n === 0 || is(n, NaN)) {
    return 0;
  }
  if (n < 0 || n > MAX_SAFE_INTEGER) {
    throw RangeError('Invalid offset');
  }
  return n;
};

/**
 * Expose the internal `ToNumber` from
 * https://tc39.es/ecma262/multipage/abstract-operations.html#sec-tonumber
 * We can't just use `Number(value)` because that is backed by `ToNumeric`,
 * which coerces bigint output from `ToPrimitive` rather than throwing a
 * TypeError as required of `ToNumber` (e.g., `Number({ valueOf: () => 42n })`
 * returns 42).
 *
 * @param {unknown} v
 * @returns {number}
 */
const toNumber = v =>
  // @ts-expect-error Math.max uses the internal `ToNumber` to coerce its
  // argument, whatever it is, to a number.
  max(v);

/**
 * Correctly guarding the `setFloat*` built-ins requires performing
 * `ToNumber(value)` ourselves, because a non-NaN value such as
 * `{ valueOf: () => {} }` gets coerced **to** NaN. But, according to
 * [SetViewValue](https://tc39.es/ecma262/multipage/structured-data.html#sec-setviewvalue),
 * we must first perform the observable
 * `RequireInternalSlot(view, [[DataView]])` and `ToIndex(requestIndex)` steps
 * (in that order). If those steps complete successfully, we have number-coerced
 * `byteOffset` and `value` values that will pass those same steps internal to
 * the implementation without incurring further observable interactions.
 *
 * We added these coercions to defend against an attack noticed by
 * https://github.com/deepview-autofix .
 * We were vulnerable to `value` being an
 * object with a `valueOf` method that returns a (bad) NaN, since it
 * would bypass the is NaN check. See where the
 * `tame-nan*-sidechannel.test.js test cases mention "coercion attack".
 *
 * Uses method shorthand syntax to be `this`-sensitive but not be constructable
 * nor have a `prototype` property.
 */
const methods = {
  /**
   * @param {number} byteOffset
   * @param {number} value
   * @param {boolean} [isLittleEndian]
   */
  setFloat16(byteOffset, value, isLittleEndian = undefined) {
    requireDataView(this);
    byteOffset = toIndex(byteOffset);
    value = toNumber(value);
    if (is(value, NaN)) {
      return apply(setUint16, this, [
        byteOffset,
        canonicalNaN16Encoding,
        isLittleEndian,
      ]);
    } else {
      return apply(FERAL_SET_FLOAT16, this, [
        byteOffset,
        value,
        isLittleEndian,
      ]);
    }
  },

  /**
   * @param {number} byteOffset
   * @param {number} value
   * @param {boolean} [isLittleEndian]
   */
  setFloat32(byteOffset, value, isLittleEndian = undefined) {
    requireDataView(this);
    byteOffset = toIndex(byteOffset);
    value = toNumber(value);
    if (is(value, NaN)) {
      return apply(setUint32, this, [
        byteOffset,
        canonicalNaN32Encoding,
        isLittleEndian,
      ]);
    } else {
      return apply(FERAL_SET_FLOAT32, this, [
        byteOffset,
        value,
        isLittleEndian,
      ]);
    }
  },

  /**
   * @param {number} byteOffset
   * @param {number} value
   * @param {boolean} [isLittleEndian]
   */
  setFloat64(byteOffset, value, isLittleEndian = undefined) {
    requireDataView(this);
    byteOffset = toIndex(byteOffset);
    value = toNumber(value);
    if (is(value, NaN)) {
      return apply(setBigUint64, this, [
        byteOffset,
        canonicalNaN64Encoding,
        isLittleEndian,
      ]);
    } else {
      return apply(FERAL_SET_FLOAT64, this, [
        byteOffset,
        value,
        isLittleEndian,
      ]);
    }
  },
};

/**
 * Replaces the dangerous `setFloat*` methods on `DataView.prototype`
 * with safe wrappers that first canonicalize NaNs before calling the
 * original hidden methods.
 * By itself, this does not make us safe against the NaN side channel.
 * Separately, we do not include the `Float*Array` constructors on the
 * list of universal safe globals. Thus, constructed compartments do not
 * get these by default.
 *
 * These replacement `setFloat*` methods canonicalize NaN, but they
 * do not canonicalize `-0` to `0`. If callers wish to do so, they should do
 * it themselves before calling these
 */
export const tameNaNSideChannel = () => {
  for (const [name, method] of entries(methods)) {
    if (hasOwn(dataViewPrototype, name)) {
      defineProperty(dataViewPrototype, name, {
        // Since we're redefining properties that already exist, by omitting the
        // other descriptor attributes here, they are unchanged.
        value: method,
      });
    }
  }
};
