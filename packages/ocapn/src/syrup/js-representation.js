// @ts-check

import { passableSymbolForName } from '@endo/pass-style';
import {
  BooleanCodec,
  BytestringCodec,
  Float64Codec,
  IntegerCodec,
  makeCodec,
  makeListCodecFromEntryCodec,
  makeSetCodecFromEntryCodec,
  makeTypeHintUnionCodec,
  StringCodec,
} from './codec.js';
import { compareByteArrays } from './compare.js';
import { makeSyrupReader } from './decode.js';
import { makeSyrupWriter } from './encode.js';

/**
 * @import { SyrupCodec, SyrupRecordCodec, SyrupRecordLabelType } from './codec.js'
 * @import { SyrupReader, SyrupType, TypeHintTypes } from './decode.js'
 * @import { SyrupWriter } from './encode.js'
 */

/*
 * This is a set of codecs that are used to represent Syrup values as JavaScript values.
 * It is not used in OCapN, but it is useful for testing and debugging arbitrary Syrup values.
 */

const { freeze, defineProperty } = Object;
const { ownKeys } = Reflect;
const quote = JSON.stringify;

export const SYRUP_SELECTOR_PREFIX = 'syrup:';

// To be used as keys, syrup selectors must be javascript symbols.
// To avoid an otherwise meaningful symbol name, we prefix it with 'syrup:'.
export const SyrupSelectorFor = name =>
  passableSymbolForName(`${SYRUP_SELECTOR_PREFIX}${name}`);

/**
 * @param {symbol} selectorSymbol
 * @returns {string}
 */
export const getSyrupSelectorName = selectorSymbol => {
  const description = selectorSymbol.description;
  if (!description) {
    throw TypeError(`Symbol ${String(selectorSymbol)} has no description`);
  }
  if (!description.startsWith(SYRUP_SELECTOR_PREFIX)) {
    throw TypeError(
      `Symbol ${String(selectorSymbol)} has a description that does not start with "${SYRUP_SELECTOR_PREFIX}", got "${description}"`,
    );
  }
  return description.slice(SYRUP_SELECTOR_PREFIX.length);
};

/** @type {SyrupCodec} */
const SelectorAsSymbolCodec = {
  read: syrupReader => {
    const selectorString = syrupReader.readSelectorAsString();
    return SyrupSelectorFor(selectorString);
  },
  write: (value, syrupWriter) => {
    const selectorString = getSyrupSelectorName(value);
    syrupWriter.writeSelectorFromString(selectorString);
  },
};

/** @type {SyrupCodec} */
export const NumberPrefixCodecWithSelectorAsSymbol = {
  read: syrupReader => {
    const { type, value } = syrupReader.readTypeAndMaybeValue();
    if (
      type !== 'integer' &&
      type !== 'string' &&
      type !== 'selector' &&
      type !== 'bytestring'
    ) {
      throw Error(
        'SyrupNumberPrefixCodec: read only supports integer, string, selector, and bytestring',
      );
    }
    if (type === 'selector') {
      return SyrupSelectorFor(value);
    }
    return value;
  },
  write: (value, syrupWriter) => {
    if (typeof value === 'string') {
      syrupWriter.writeString(value);
    } else if (typeof value === 'symbol') {
      const selectorString = getSyrupSelectorName(value);
      syrupWriter.writeSelectorFromString(selectorString);
    } else if (value instanceof Uint8Array) {
      syrupWriter.writeBytestring(value);
    } else if (typeof value === 'bigint') {
      syrupWriter.writeInteger(value);
    } else {
      throw Error(
        'SyrupNumberPrefixCodec: write only supports string, bigint, symbol, and bytestring',
      );
    }
  },
};

/** @type {SyrupCodec} */
export const AnyCodec = makeTypeHintUnionCodec(
  'SyrupAnyCodec',
  {
    boolean: BooleanCodec,
    float64: Float64Codec,
    'number-prefix': NumberPrefixCodecWithSelectorAsSymbol,
    // eslint-disable-next-line no-use-before-define
    list: () => ListCodec,
    // eslint-disable-next-line no-use-before-define
    set: () => SetCodec,
    // eslint-disable-next-line no-use-before-define
    dictionary: () => DictionaryCodec,
    // eslint-disable-next-line no-use-before-define
    record: () => RecordCodec,
  },
  {
    boolean: BooleanCodec,
    number: Float64Codec,
    bigint: IntegerCodec,
    symbol: SelectorAsSymbolCodec,
    string: StringCodec,
    object: value => {
      if (Array.isArray(value)) {
        // eslint-disable-next-line no-use-before-define
        return ListCodec;
      } else if (value instanceof Set) {
        // eslint-disable-next-line no-use-before-define
        return SetCodec;
      } else if (value instanceof Uint8Array) {
        return BytestringCodec;
      } else if (typeof value === 'object' && value !== null) {
        if (value[Symbol.toStringTag] === 'Record') {
          // eslint-disable-next-line no-use-before-define
          return RecordCodec;
        }
        // eslint-disable-next-line no-use-before-define
        return DictionaryCodec;
      }
      throw Error('SyrupAnyCodec: object must be an array, set, or dictionary');
    },
  },
);

export const ListCodec = makeListCodecFromEntryCodec(
  'SyrupListCodec',
  AnyCodec,
);
export const SetCodec = makeSetCodecFromEntryCodec('SyrupSetCodec', AnyCodec);

/** @type {SyrupCodec} */
const DictionaryKeyCodec = {
  read: syrupReader => {
    const start = syrupReader.index;
    const { value, type } = syrupReader.readTypeAndMaybeValue();
    if (type === 'selector') {
      return SyrupSelectorFor(value);
    } else if (type === 'string') {
      return value;
    }
    throw Error(
      `Unexpected type "${type}", Syrup dictionary keys must be strings or selectors at index ${start} of ${syrupReader.name}`,
    );
  },
  write: (value, syrupWriter) => {
    const start = syrupWriter.index;
    if (typeof value === 'symbol') {
      const selectorString = getSyrupSelectorName(value);
      syrupWriter.writeSelectorFromString(selectorString);
    } else if (typeof value === 'string') {
      syrupWriter.writeString(value);
    } else {
      throw Error(
        `Unexpected type "${typeof value}", Syrup dictionary keys must be strings or symbols at index ${start}`,
      );
    }
  },
};

/** @type {SyrupCodec} */
export const DictionaryCodec = freeze({
  read: syrupReader => {
    const result = {};
    /** @type {symbol | string | undefined} */
    let priorKey;
    /** @type {Uint8Array | undefined} */
    let priorKeyBytes;

    syrupReader.enterDictionary();
    while (!syrupReader.peekDictionaryEnd()) {
      const start = syrupReader.index;
      const key = DictionaryKeyCodec.read(syrupReader);
      const scratchWriter = makeSyrupWriter({
        name: `${syrupReader.name}.scratch`,
      });
      DictionaryKeyCodec.write(key, scratchWriter);
      const newKeyBytes = scratchWriter.getBytes();
      if (priorKeyBytes !== undefined) {
        const order = compareByteArrays(
          priorKeyBytes,
          newKeyBytes,
          0,
          priorKeyBytes.length,
          0,
          newKeyBytes.length,
        );
        if (order === 0) {
          throw Error(
            `Syrup dictionary keys must be unique, got repeated ${quote(key)} at index ${start} of ${syrupReader.name}`,
          );
        } else if (order > 0) {
          throw Error(
            `Syrup dictionary keys must be in bytewise sorted order, got ${quote(key)} immediately after ${quote(priorKey)} at index ${start} of ${syrupReader.name}`,
          );
        }
      }
      priorKey = key;
      priorKeyBytes = newKeyBytes;
      const value = AnyCodec.read(syrupReader);
      defineProperty(result, key, {
        value,
        enumerable: true,
        writable: false,
        configurable: false,
      });
    }
    syrupReader.exitDictionary();
    return result;
  },
  write: (value, syrupWriter) => {
    const indexes = [];
    const keys = [];
    const keyBytes = [];

    // We need to sort the keys, so we write them to a scratch buffer first
    const scratchWriter = makeSyrupWriter();
    for (const key of ownKeys(value)) {
      const start = scratchWriter.index;
      DictionaryKeyCodec.write(key, scratchWriter);
      const end = scratchWriter.index;
      keys.push(key);
      keyBytes.push(scratchWriter.getBytes().subarray(start, end));
      indexes.push(indexes.length);
    }
    indexes.sort((i, j) =>
      compareByteArrays(
        keyBytes[i],
        keyBytes[j],
        0,
        keyBytes[i].length,
        0,
        keyBytes[j].length,
      ),
    );

    syrupWriter.enterDictionary();
    for (const index of indexes) {
      const key = keys[index];
      const entry = value[key];
      DictionaryKeyCodec.write(key, syrupWriter);
      AnyCodec.write(entry, syrupWriter);
    }
    syrupWriter.exitDictionary();
  },
});

const RecordCodec = makeCodec('SyrupRecordCodec', {
  read: syrupReader => {
    const values = [];
    syrupReader.enterRecord();
    const label = syrupReader.readSelectorAsString();
    while (!syrupReader.peekRecordEnd()) {
      const value = AnyCodec.read(syrupReader);
      values.push(value);
    }
    syrupReader.exitRecord();
    return { [Symbol.toStringTag]: 'Record', label, values };
  },
  write: (value, syrupWriter) => {
    syrupWriter.enterRecord();
    syrupWriter.writeSelectorFromString(value.label);
    for (const entry of value.values) {
      AnyCodec.write(entry, syrupWriter);
    }
    syrupWriter.exitRecord();
  },
});

/**
 * @param {Uint8Array} bytes
 * @param {object} options
 * @param {string} [options.name]
 * @param {number} [options.start]
 * @param {number} [options.end]
 */
export function decodeSyrup(bytes, options = {}) {
  const syrupReader = makeSyrupReader(bytes, options);
  return AnyCodec.read(syrupReader);
}

/**
 * @param {any} value
 * @param {object} [options]
 * @param {number} [options.length] A guess at the length. If provided, must be
 * greater than zero.
 * @returns {Uint8Array}
 */
export function encodeSyrup(value, options = {}) {
  const syrupWriter = makeSyrupWriter(options);
  AnyCodec.write(value, syrupWriter);
  return syrupWriter.getBytes();
}
