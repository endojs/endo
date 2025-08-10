import { isByteArray } from '../pass-style-helpers.js';
import { makeCodec } from '../syrup/codec.js';
import { ByteArrayCodec } from './atoms.js';

/** @typedef {import('../syrup/codec.js').SyrupCodec} SyrupCodec */

/** @type {SyrupCodec} */
export const NonNegativeIntegerCodec = makeCodec('NonNegativeInteger', {
  write: (value, syrupWriter) => {
    if (typeof value !== 'bigint') {
      throw Error('value must be a bigint');
    }
    if (value < 0n) {
      throw Error('value must be non-negative');
    }
    syrupWriter.writeInteger(value);
  },
  read: syrupReader => {
    const value = syrupReader.readInteger();
    if (value < 0n) {
      throw Error('value must be non-negative');
    }
    return value;
  },
});

/** @type {SyrupCodec} */
export const FalseCodec = makeCodec('False', {
  write: (value, syrupWriter) => {
    if (value) {
      throw Error('FalseCodec: value must be false');
    }
    syrupWriter.writeBoolean(value);
  },
  read: syrupReader => {
    const value = syrupReader.readBoolean();
    if (value) {
      throw Error('FalseCodec: value must be false');
    }
    return value;
  },
});

/**
 * @param {string} codecName
 * @param {number} length
 * @returns {SyrupCodec}
 */
export const makeExpectedLengthByteArrayCodec = (codecName, length) => {
  return makeCodec(codecName, {
    read: syrupReader => {
      const bytestring = ByteArrayCodec.read(syrupReader);
      if (bytestring.length !== length) {
        throw Error(`Expected length ${length}, got ${bytestring.length}`);
      }
      return bytestring;
    },
    write: (value, syrupWriter) => {
      if (!isByteArray(value)) {
        throw Error(`Expected ByteArray, got ${typeof value}`);
      }
      if (value.length !== length) {
        throw Error(`Expected length ${length}, got ${value.length}`);
      }
      ByteArrayCodec.write(value, syrupWriter);
    },
  });
};
