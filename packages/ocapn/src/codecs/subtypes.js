import { makeCodec } from '../syrup/codec.js';

/** @import { SyrupCodec } from '../syrup/codec.js' */

const quote = JSON.stringify;

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
 * @param {() => SyrupCodec} getValuesCodec
 * @returns {SyrupCodec}
 */
export const makeStructCodecForValues = (codecName, getValuesCodec) => {
  /** @type {SyrupCodec} */
  return makeCodec(codecName, {
    read(syrupReader) {
      const ValuesCodec = getValuesCodec();
      /** @type {string | undefined} */
      let lastKey;
      syrupReader.enterDictionary();
      const result = {};
      while (!syrupReader.peekDictionaryEnd()) {
        // OCapN Structs are always string keys.
        const start = syrupReader.index;
        const key = syrupReader.readString();
        if (lastKey !== undefined) {
          if (key === lastKey) {
            throw new Error(
              `OcapnStruct must have unique keys, got repeated ${quote(key)} at index ${start} of ${syrupReader.name}`,
            );
          }
          if (key < lastKey) {
            throw new Error(
              `OcapnStruct keys must be in bytewise sorted order, got ${quote(key)} immediately after ${quote(lastKey)} at index ${start} of ${syrupReader.name}`,
            );
          }
        }
        lastKey = key;
        // Value can be any Passable.
        const value = ValuesCodec.read(syrupReader);
        result[key] = value;
      }
      syrupReader.exitDictionary();
      return result;
    },
    write(value, syrupWriter) {
      const ValuesCodec = getValuesCodec();
      syrupWriter.enterDictionary();
      const keys = Object.keys(value);
      keys.sort();
      for (const key of keys) {
        syrupWriter.writeString(key);
        // Value can be any Passable.
        const passable = value[key];
        ValuesCodec.write(passable, syrupWriter);
      }
      syrupWriter.exitDictionary();
    },
  });
};
