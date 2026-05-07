import { ZERO_N } from '@endo/nat';
import { makeCodec, makeListCodecFromEntryCodec } from '../syrup/codec.js';

/** @import { SyrupCodec } from '../syrup/codec.js' */

const quote = JSON.stringify;

// Allows positive integers only. Zero is not allowed.
export const PositiveIntegerCodec = makeCodec('PositiveInteger', {
  write: (value, syrupWriter) => {
    if (typeof value !== 'bigint') {
      throw Error('value must be a bigint');
    }
    if (value <= ZERO_N) {
      throw Error('value must be positive');
    }
    syrupWriter.writeInteger(value);
  },
  read: syrupReader => {
    const value = syrupReader.readInteger();
    if (value <= ZERO_N) {
      throw Error('value must be positive');
    }
    return value;
  },
});

// Allows positive integers and zero
export const NonNegativeIntegerCodec = makeCodec('NonNegativeInteger', {
  write: (value, syrupWriter) => {
    if (typeof value !== 'bigint') {
      throw Error('value must be a bigint');
    }
    if (value < ZERO_N) {
      throw Error('value must be non-negative');
    }
    syrupWriter.writeInteger(value);
  },
  read: syrupReader => {
    const value = syrupReader.readInteger();
    if (value < ZERO_N) {
      throw Error('value must be non-negative');
    }
    return value;
  },
});

/** @type {SyrupCodec} */
export const NonNegativeIntegerListCodec = makeListCodecFromEntryCodec(
  'NonNegativeIntegerList',
  NonNegativeIntegerCodec,
);

/** @type {SyrupCodec} */
export const PositiveIntegerListCodec = makeListCodecFromEntryCodec(
  'PositiveIntegerList',
  PositiveIntegerCodec,
);

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
 * Wrap a child codec so the field accepts `false` as a sentinel for
 * "absent / no value." OCapN uses this pattern for optional message
 * slots (e.g. `op:deliver` with no `resolveMeDesc` or no
 * `answerPosition`). Reading peeks the next type hint and routes to
 * `FalseCodec` when the wire byte is the boolean tag.
 *
 * @param {string} codecName
 * @param {SyrupCodec} childCodec
 * @returns {SyrupCodec}
 */
export const makeOcapnFalseForOptionalCodec = (codecName, childCodec) => {
  /** @type {SyrupCodec} */
  return makeCodec(codecName, {
    read: reader => {
      const hint = reader.peekTypeHint();
      if (hint === 'boolean') {
        return FalseCodec.read(reader);
      }
      return childCodec.read(reader);
    },
    write: (value, writer) => {
      if (value === false) {
        FalseCodec.write(false, writer);
      } else {
        childCodec.write(value, writer);
      }
    },
  });
};

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
        /** @type {string} */
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
      const keys = Object.keys(value);
      keys.sort();
      syrupWriter.enterDictionary(keys.length);
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
