import {
  Object,
  DataView,
  Reflect,
  Number,
  TypeError,
  RangeError,
  Math,
  hasOwn,
} from './commons.js';

const { is, defineProperty, entries } = Object;
const { apply } = Reflect;
const { prototype: dataViewPrototype } = DataView;
const { trunc } = Math;

/**
 * These `FERAL*` methods open up the NaN side-channel on some platforms,
 * like v8. Thus, we need to encapsulate them and replace them with wrappers
 * that canonicaize NaNs.
 */
const {
  setFloat16: FERAL_SET_FLOAT16,
  setFloat32: FERAL_SET_FLOAT32,
  setFloat64: FERAL_SET_FLOAT64,

  setUint16,
  setUint32,
  setBigUint64,
} = dataViewPrototype;

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
const canonicalNaN64Encoding = 0x7ff8000000000000n;

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
const canonicalNaN32Encoding = 0x7fc00000;

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
  if (is(n, NaN) || is(n, -0)) {
    return 0;
  }
  if (n < 0 || n > Number.MAX_SAFE_INTEGER) {
    throw new RangeError(
      `Offset is out of bounds for an index into a DataView`,
    );
  }
  return n;
};

/**
 * Emulate the internal `ToNumber` from
 * https://tc39.es/ecma262/multipage/abstract-operations.html#sec-tonumber
 * It seems that JS built-in `Number` function is an adequate emulation
 * except that `ToNumber(bigint)` throws whereas `Number(bigint)` coerces it
 * to a `number`.
 *
 * @param {unknown} v
 * @returns {number}
 */
const toNumber = v => {
  if (typeof v === 'bigint') {
    throw new TypeError(
      `DataView.prototype.set* methods cannot convert a BigInt to a number`,
    );
  }
  return Number(v);
};

/**
 * To correctly and safely emulate the `setFloat*` built-ins we wrap,
 * we do the `ToNumber(value)` coercion ourselves, so that our `if`
 * safely guards the built-in. But, according to
 * [SetValueView](https://tc39.es/ecma262/multipage/structured-data.html#sec-setviewvalue),
 * we must therefore do the `ToIndex(byteOffset)` first. OTOH, we safely
 * delegate the `ToBoolean(isLittleEndian)` to the built-in, since
 * the conditional on `NaN` has already been safely performed.
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
    byteOffset = toIndex(byteOffset);
    value = toNumber(value);
    if (is(value, NaN)) {
      return apply(setUint16, this, [
        byteOffset,
        Number(canonicalNaN16Encoding),
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
