import { Object, DataView, Reflect, Number } from './commons.js';

const { is, defineProperty, entries } = Object;
const { apply } = Reflect;

const { prototype: dataViewPrototype } = DataView;

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

// See https://webidl.spec.whatwg.org/#js-unrestricted-double which implies
// that this is the canonical NaN for web standards.
// Casual googling stongly suggests that this is also the cosmWasm
// canonical NaN. But I have not yet found an authoritative page stating this.
const canonicalNaN = 0x7ff8000000000000n;

// Use method shorthand syntax to be this-sensitive but now be constructable
// nor have a `prototype` property.
const methods = {
  /**
   * @param {number} byteOffset
   * @param {number} value
   * @param {boolean} [littleEndian]
   */
  setFloat16(byteOffset, value, littleEndian = undefined) {
    if (is(value, NaN)) {
      return apply(setUint16, this, [
        byteOffset,
        Number(canonicalNaN),
        littleEndian,
      ]);
    } else {
      return apply(FERAL_SET_FLOAT16, this, [byteOffset, value, littleEndian]);
    }
  },
  /**
   * @param {number} byteOffset
   * @param {number} value
   * @param {boolean} [littleEndian]
   */
  setFloat32(byteOffset, value, littleEndian = undefined) {
    if (is(value, NaN)) {
      return apply(setUint32, this, [
        byteOffset,
        Number(canonicalNaN),
        littleEndian,
      ]);
    } else {
      return apply(FERAL_SET_FLOAT32, this, [byteOffset, value, littleEndian]);
    }
  },
  /**
   * @param {number} byteOffset
   * @param {number} value
   * @param {boolean} [littleEndian]
   */
  setFloat64(byteOffset, value, littleEndian = undefined) {
    if (is(value, NaN)) {
      return apply(setBigUint64, this, [
        byteOffset,
        canonicalNaN,
        littleEndian,
      ]);
    } else {
      return apply(FERAL_SET_FLOAT64, this, [byteOffset, value, littleEndian]);
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
    defineProperty(dataViewPrototype, name, {
      // Since we're redefining properties that already exist, by omitting the
      // other descriptor attributes here, they are unchanged.
      value: method,
    });
  }
};
