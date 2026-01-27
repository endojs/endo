/**
 * @import { OcapnPassStyle } from '../codecs/ocapn-pass-style.js'
 * @import { SyrupReader, SyrupType, TypeHintTypes } from './decode.js'
 * @import { SyrupWriter } from './encode.js'
 * @import { OcapnReader, OcapnWriter } from '../codec-interface.js'
 */

import {
  decodeImmutableArrayBufferToString,
  encodeStringToImmutableArrayBuffer,
} from '../buffer-utils.js';
import { ocapnPassStyleOf } from '../codecs/ocapn-pass-style.js';

/**
 * A codec that can read and write values using any OCapN reader/writer.
 * Works with both Syrup and CBOR codecs.
 *
 * @typedef {object} SyrupCodec
 * @property {function(OcapnReader): any} read
 * @property {function(any, OcapnWriter): void} write
 */

/**
 * Alias for SyrupCodec - a data codec that transforms values to/from wire format.
 *
 * @typedef {SyrupCodec} DataCodec
 */

const { freeze } = Object;
const quote = JSON.stringify;

export const makeCodecWriteWithErrorWrapping = (codecName, write) => {
  /** @type {SyrupCodec['write']} */
  return (value, syrupWriter) => {
    try {
      return write(value, syrupWriter);
    } catch (error) {
      throw Error(
        `${codecName}: write failed at index ${syrupWriter.index} of ${syrupWriter.name}`,
        { cause: error },
      );
    }
  };
};

export const makeCodecReadWithErrorWrapping = (codecName, read) => {
  /** @type {SyrupCodec['read']} */
  return syrupReader => {
    const start = syrupReader.index;
    try {
      return read(syrupReader);
    } catch (error) {
      throw new Error(
        `${codecName}: read failed at index ${start} of ${syrupReader.name}`,
        { cause: error },
      );
    }
  };
};

/**
 * @param {string} codecName
 * @param {SyrupCodec} codec
 * @returns {SyrupCodec}
 */
export const makeCodec = (codecName, { write, read }) => {
  return freeze({
    /**
     * @param {any} value
     * @param {SyrupWriter} syrupWriter
     * @returns {void}
     */
    write: makeCodecWriteWithErrorWrapping(codecName, write),
    /**
     * @param {SyrupReader} syrupReader
     * @returns {any}
     */
    read: makeCodecReadWithErrorWrapping(codecName, read),
  });
};

/** @type {SyrupCodec} */
export const SelectorAsStringCodec = makeCodec('SelectorAsString', {
  write: (value, syrupWriter) => syrupWriter.writeSelectorFromString(value),
  read: syrupReader => syrupReader.readSelectorAsString(),
});

/** @type {SyrupCodec} */
export const StringCodec = makeCodec('String', {
  write: (value, syrupWriter) => syrupWriter.writeString(value),
  read: syrupReader => syrupReader.readString(),
});

/** @type {SyrupCodec} */
export const BytestringCodec = makeCodec('Bytestring', {
  write: (value, syrupWriter) => syrupWriter.writeBytestring(value),
  read: syrupReader => syrupReader.readBytestring(),
});

/** @type {SyrupCodec} */
export const BooleanCodec = makeCodec('Boolean', {
  write: (value, syrupWriter) => syrupWriter.writeBoolean(value),
  read: syrupReader => syrupReader.readBoolean(),
});

/** @type {SyrupCodec} */
export const IntegerCodec = makeCodec('Integer', {
  write: (value, syrupWriter) => syrupWriter.writeInteger(value),
  read: syrupReader => syrupReader.readInteger(),
});

/** @type {SyrupCodec} */
export const Float64Codec = makeCodec('Float64', {
  write: (value, syrupWriter) => syrupWriter.writeFloat64(value),
  read: syrupReader => syrupReader.readFloat64(),
});

const SimpleValueCodecs = {
  boolean: BooleanCodec,
  integer: IntegerCodec,
  float64: Float64Codec,
  string: StringCodec,
  selector: SelectorAsStringCodec,
  bytestring: BytestringCodec,
};

/**
 * @param {string} codecName
 * @param {string} selector
 * @returns {SyrupCodec}
 */
export const makeExactSelectorCodec = (codecName, selector) => {
  return makeCodec(codecName, {
    read: syrupReader => {
      const actualSelector = syrupReader.readSelectorAsString();
      if (actualSelector !== selector) {
        throw Error(
          `Expected selector ${quote(selector)}, got ${quote(actualSelector)}`,
        );
      }
      return actualSelector;
    },
    write: (value, syrupWriter) => {
      if (typeof value !== 'string') {
        throw Error(`Expected string, got ${typeof value}`);
      }
      if (value !== selector) {
        throw Error(
          `Expected selector ${quote(selector)}, got ${quote(value)}`,
        );
      }
      syrupWriter.writeSelectorFromString(value);
    },
  });
};

/**
 * @param {string} codecName
 * @param {number} length
 * @returns {SyrupCodec}
 */
export const makeExpectedLengthBytestringCodec = (codecName, length) => {
  return makeCodec(codecName, {
    read: syrupReader => {
      const bytestring = syrupReader.readBytestring();
      if (bytestring.byteLength !== length) {
        throw Error(`Expected length ${length}, got ${bytestring.byteLength}`);
      }
      return bytestring;
    },
    write: (value, syrupWriter) => {
      if (!(value instanceof ArrayBuffer)) {
        throw Error(`Expected ArrayBuffer, got ${typeof value}`);
      }
      if (value.byteLength !== length) {
        throw Error(`Expected length ${length}, got ${value.byteLength}`);
      }
      syrupWriter.writeBytestring(value);
    },
  });
};

/** @type {SyrupCodec} */
export const NumberPrefixCodec = makeCodec('NumberPrefix', {
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
    return value;
  },
  write: (value, syrupWriter) => {
    if (typeof value === 'string') {
      syrupWriter.writeString(value);
    } else if (value instanceof ArrayBuffer) {
      syrupWriter.writeBytestring(value);
    } else if (typeof value === 'bigint') {
      syrupWriter.writeInteger(value);
    } else {
      throw Error(
        'SyrupNumberPrefixCodec: write only supports string, bigint, and bytestring',
      );
    }
  },
});

/**
 * @typedef {SyrupCodec | string | function(any): SyrupCodec} ResolvableCodec
 */

/**
 * @param {ResolvableCodec} codecOrGetter
 * @param {any} [value]
 * @returns {SyrupCodec}
 * This is a helper function that resolves a codec or getter to a codec.
 */
const resolveCodec = (codecOrGetter, value) => {
  if (typeof codecOrGetter === 'function') {
    const codec = codecOrGetter(value);
    if (typeof codec !== 'object' || codec === null) {
      throw Error(`Codec function must return a codec, got ${typeof codec}`);
    }
    return codec;
  }
  if (typeof codecOrGetter === 'string') {
    const codec = SimpleValueCodecs[codecOrGetter];
    if (!codec) {
      throw Error(
        `Unexpected value type ${quote(codecOrGetter)}, expected one of ${Object.keys(SimpleValueCodecs).join(', ')}`,
      );
    }
    return codec;
  }
  if (typeof codecOrGetter === 'object' && codecOrGetter !== null) {
    return codecOrGetter;
  }
  throw Error(`Unexpected codec or getter ${quote(codecOrGetter)}`);
};

/**
 * @param {string} codecName
 * @param {SyrupCodec} childCodec
 * @returns {SyrupCodec}
 * Codec for a set of items of unknown length and known entry type
 */
export const makeSetCodecFromEntryCodec = (codecName, childCodec) => {
  return makeCodec(codecName, {
    read: syrupReader => {
      syrupReader.enterSet();
      const result = new Set();
      while (!syrupReader.peekSetEnd()) {
        // eslint-disable-next-line no-use-before-define
        const value = childCodec.read(syrupReader);
        result.add(value);
      }
      syrupReader.exitSet();
      return result;
    },
    write: (value, syrupWriter) => {
      syrupWriter.enterSet(value.size);
      for (const child of value) {
        childCodec.write(child, syrupWriter);
      }
      syrupWriter.exitSet();
    },
  });
};

/**
 * @param {string} codecName
 * @param {ResolvableCodec} childCodecOrGetter
 * @returns {SyrupCodec}
 * Codec for a list of items of unknown length and known entry type
 */
export const makeListCodecFromEntryCodec = (codecName, childCodecOrGetter) => {
  return makeCodec(codecName, {
    read: syrupReader => {
      const childCodec = resolveCodec(childCodecOrGetter, syrupReader);
      syrupReader.enterList();
      const result = [];
      while (!syrupReader.peekListEnd()) {
        const value = childCodec.read(syrupReader);
        result.push(value);
      }
      syrupReader.exitList();
      return result;
    },
    write: (value, syrupWriter) => {
      const childCodec = resolveCodec(childCodecOrGetter, value);
      syrupWriter.enterList(value.length);
      for (const child of value) {
        childCodec.write(child, syrupWriter);
      }
      syrupWriter.exitList();
    },
  });
};

/**
 * @param {string} codecName
 * @param {SyrupCodec[]} listDefinition
 * @returns {SyrupCodec}
 * Codec for a list of items of known length and known entry type
 */
export const makeExactListCodec = (codecName, listDefinition) => {
  const elementCount = listDefinition.length;
  return makeCodec(codecName, {
    read: syrupReader => {
      syrupReader.enterList();
      const result = [];
      for (const entryCodec of listDefinition) {
        const value = entryCodec.read(syrupReader);
        result.push(value);
      }
      syrupReader.exitList();
      return result;
    },
    write: (value, syrupWriter) => {
      if (!(value instanceof Array)) {
        throw Error(`Expected array, got ${typeof value}`);
      }
      if (value.length !== listDefinition.length) {
        throw Error(
          `Expected length ${listDefinition.length}, got ${value.length}`,
        );
      }
      syrupWriter.enterList(elementCount);
      for (let index = 0; index < value.length; index += 1) {
        const entryCodec = listDefinition[index];
        entryCodec.write(value[index], syrupWriter);
      }
      syrupWriter.exitList();
    },
  });
};

/**
 * @typedef {SyrupCodec & {
 *   label: string;
 *   readBody: (SyrupReader) => any;
 *   writeBody: (any, SyrupWriter) => void;
 * }} SyrupRecordCodec
 */

/**
 * @typedef {'selector' | 'string' | 'bytestring'} SyrupRecordLabelType
 * see https://github.com/ocapn/syrup/issues/22
 */

/**
 * @param {string} codecName
 * @param {string} label
 * @param {SyrupRecordLabelType} labelType
 * @param {function(SyrupReader): any} readBody
 * @param {function(any, SyrupWriter): void} writeBody
 * @param {number} [fieldCount] - Number of fields in the record body (required for CBOR)
 * @returns {SyrupRecordCodec}
 */
export const makeRecordCodec = (
  codecName,
  label,
  labelType,
  readBody,
  writeBody,
  fieldCount,
) => {
  // Element count = 1 (label) + field count
  // Undefined fieldCount is allowed for backwards compatibility (Syrup ignores it)
  const elementCount = fieldCount !== undefined ? 1 + fieldCount : undefined;

  /**
   * @param {SyrupReader} syrupReader
   * @returns {any}
   */
  const read = syrupReader => {
    syrupReader.enterRecord();
    const labelInfo = syrupReader.readRecordLabel();
    // Use the reader's preferred record label type when labelType is 'selector'.
    // This allows CBOR to read plain strings for record labels while Syrup reads symbols.
    const effectiveLabelType =
      labelType === 'selector' && syrupReader.recordLabelType
        ? syrupReader.recordLabelType
        : labelType;
    if (labelInfo.type !== effectiveLabelType) {
      throw Error(
        `${codecName}: Expected label type ${quote(effectiveLabelType)} for ${quote(label)}, got ${quote(labelInfo.type)}`,
      );
    }
    const labelString =
      labelInfo.type === 'bytestring'
        ? decodeImmutableArrayBufferToString(labelInfo.value)
        : labelInfo.value;
    if (labelString !== label) {
      throw Error(
        `${codecName}: Expected label ${quote(label)}, got ${quote(labelString)}`,
      );
    }
    const result = readBody(syrupReader);
    syrupReader.exitRecord();
    return result;
  };
  /**
   * @param {any} value
   * @param {SyrupWriter} syrupWriter
   */
  const write = (value, syrupWriter) => {
    syrupWriter.enterRecord(elementCount);
    // Use the writer's preferred record label type when labelType is 'selector'.
    // This allows CBOR to use plain strings for record labels while Syrup uses symbols.
    const effectiveLabelType =
      labelType === 'selector' && syrupWriter.recordLabelType
        ? syrupWriter.recordLabelType
        : labelType;
    if (effectiveLabelType === 'selector') {
      syrupWriter.writeSelectorFromString(label);
    } else if (effectiveLabelType === 'string') {
      syrupWriter.writeString(label);
    } else if (effectiveLabelType === 'bytestring') {
      syrupWriter.writeBytestring(encodeStringToImmutableArrayBuffer(label));
    }
    writeBody(value, syrupWriter);
    syrupWriter.exitRecord();
  };

  return freeze({
    label,
    read: makeCodecReadWithErrorWrapping(codecName, read),
    readBody,
    write: makeCodecWriteWithErrorWrapping(codecName, write),
    writeBody,
  });
};

/** @typedef {Record<string, SyrupType | SyrupCodec>} SyrupRecordDefinition */

/**
 * @param {string} codecName
 * @param {string} label
 * @param {SyrupRecordLabelType} labelType
 * @param {SyrupRecordDefinition} definition
 * @returns {SyrupRecordCodec}
 */
export const makeRecordCodecFromDefinition = (
  codecName,
  label,
  labelType,
  definition,
) => {
  const fieldCount = Object.keys(definition).length;

  /**
   * @param {SyrupReader} syrupReader
   * @returns {any}
   */
  const readBody = syrupReader => {
    const result = {};
    for (const [fieldName, fieldType] of Object.entries(definition)) {
      const fieldCodec = resolveCodec(fieldType);
      result[fieldName] = fieldCodec.read(syrupReader);
    }
    result.type = label;
    harden(result);
    return result;
  };
  /**
   * @param {any} value
   * @param {SyrupWriter} syrupWriter
   */
  const writeBody = (value, syrupWriter) => {
    for (const [fieldName, fieldType] of Object.entries(definition)) {
      const fieldValue = value[fieldName];
      const fieldCodec = resolveCodec(fieldType, fieldValue);
      try {
        fieldCodec.write(fieldValue, syrupWriter);
      } catch (error) {
        throw Error(`${codecName}: write failed for field ${fieldName}`, {
          cause: error,
        });
      }
    }
  };

  return makeRecordCodec(
    codecName,
    label,
    labelType,
    readBody,
    writeBody,
    fieldCount,
  );
};

/**
 * @param {string} codecName
 * @param {function(SyrupReader): SyrupCodec} selectCodecForRead
 * @param {function(any): SyrupCodec} selectCodecForWrite
 * @returns {SyrupCodec}
 */
export const makeUnionCodec = (
  codecName,
  selectCodecForRead,
  selectCodecForWrite,
) => {
  /**
   * @param {SyrupReader} syrupReader
   * @returns {SyrupCodec}
   */
  const read = syrupReader => {
    const codec = selectCodecForRead(syrupReader);
    return codec.read(syrupReader);
  };
  /**
   * @param {any} value
   * @param {SyrupWriter} syrupWriter
   */
  const write = (value, syrupWriter) => {
    const codec = selectCodecForWrite(value);
    codec.write(value, syrupWriter);
  };
  return freeze({
    read: makeCodecReadWithErrorWrapping(codecName, read),
    write: makeCodecWriteWithErrorWrapping(codecName, write),
  });
};

/**
 * @typedef {'undefined'|'object'|'function'|'boolean'|'number'|'string'|'symbol'|'bigint'} JavascriptTypeofValueTypes
 * @typedef {Partial<Record<TypeHintTypes, ResolvableCodec>>} TypeHintUnionReadTable
 * @typedef {Partial<Record<JavascriptTypeofValueTypes, ResolvableCodec>>} TypeHintUnionWriteTable
 * @typedef {Partial<Record<OcapnPassStyle, ResolvableCodec>>} TypeHintPassStyleUnionWriteTable
 */

const isResolvableCodec = codec => {
  return codec && (typeof codec === 'object' || typeof codec === 'function');
};

/**
 * @param {string} codecName
 * @param {TypeHintUnionReadTable} readTable
 * @param {TypeHintUnionWriteTable} writeTable
 * @returns {SyrupCodec}
 */
export const makeTypeHintUnionCodec = (codecName, readTable, writeTable) => {
  let badCodecEntry = Object.entries(readTable).find(
    ([_, codec]) => !isResolvableCodec(codec),
  );
  if (badCodecEntry) {
    const badCodecName = badCodecEntry[0];
    throw Error(
      `${codecName}: readTable contains non-codec entry ${badCodecName}`,
    );
  }
  badCodecEntry = Object.entries(writeTable).find(
    ([_, codec]) => !isResolvableCodec(codec),
  );
  if (badCodecEntry) {
    const badCodecName = badCodecEntry[0];
    throw Error(
      `${codecName}: writeTable contains non-codec entry ${badCodecName}`,
    );
  }
  return makeUnionCodec(
    codecName,
    syrupReader => {
      const typeHint = syrupReader.peekTypeHint();
      const codecRef = readTable[typeHint];
      if (!codecRef) {
        const expected = Object.keys(readTable)
          .map(key => quote(key))
          .join(', ');
        throw Error(
          `Unexpected type hint ${quote(typeHint)}, expected one of ${expected}`,
        );
      }
      const codec = resolveCodec(codecRef, syrupReader);
      return codec;
    },
    value => {
      const codecOrGetter = writeTable[typeof value];
      if (!codecOrGetter) {
        const expected = Object.keys(writeTable)
          .map(key => quote(key))
          .join(', ');
        throw Error(
          `Unexpected value type ${quote(typeof value)}, expected one of ${expected}`,
        );
      }
      const codec = resolveCodec(codecOrGetter, value);
      return codec;
    },
  );
};

/**
 * @param {string} codecName
 * @param {TypeHintUnionReadTable} readTable
 * @param {TypeHintPassStyleUnionWriteTable} writeTable
 * @returns {SyrupCodec}
 */
export const makeTypeHintPassStyleUnionCodec = (
  codecName,
  readTable,
  writeTable,
) => {
  let badCodecEntry = Object.entries(readTable).find(
    ([_, codec]) => !isResolvableCodec(codec),
  );
  if (badCodecEntry) {
    const badCodecName = badCodecEntry[0];
    throw Error(
      `${codecName}: readTable contains non-codec entry ${badCodecName}`,
    );
  }
  badCodecEntry = Object.entries(writeTable).find(
    ([_, codec]) => !isResolvableCodec(codec),
  );
  if (badCodecEntry) {
    const badCodecName = badCodecEntry[0];
    throw Error(
      `${codecName}: writeTable contains non-codec entry ${badCodecName}`,
    );
  }
  return makeUnionCodec(
    codecName,
    syrupReader => {
      const typeHint = syrupReader.peekTypeHint();
      const codecRef = readTable[typeHint];
      if (!codecRef) {
        const expected = Object.keys(readTable)
          .map(key => quote(key))
          .join(', ');
        throw Error(
          `Unexpected type hint ${quote(typeHint)}, expected one of ${expected}`,
        );
      }
      const codec = resolveCodec(codecRef, syrupReader);
      return codec;
    },
    value => {
      const passStyle = ocapnPassStyleOf(value);
      const codecOrGetter = writeTable[passStyle];
      if (!codecOrGetter) {
        const expected = Object.keys(writeTable)
          .map(key => quote(key))
          .join(', ');
        throw Error(
          `Unexpected passStyle type ${quote(passStyle)}, expected one of ${expected}`,
        );
      }
      const codec = resolveCodec(codecOrGetter, value);
      return codec;
    },
  );
};

/**
 * @typedef {SyrupCodec & {
 *   supports: (label: string) => boolean;
 *   getChildCodecs: () => Record<string, SyrupRecordCodec>;
 * }} SyrupRecordUnionCodec
 */

/**
 * @param {string} codecName
 * @param {Record<string, SyrupRecordCodec>} recordTypes
 * @returns {SyrupRecordUnionCodec}
 */
export const makeRecordUnionCodec = (codecName, recordTypes) => {
  harden(recordTypes);
  const recordTable = Object.fromEntries(
    Object.values(recordTypes).map(recordCodec => {
      return [recordCodec.label, recordCodec];
    }),
  );
  /**
   * @param {string} label
   * @returns {boolean}
   */
  const supports = label => {
    return recordTable[label] !== undefined;
  };
  /**
   * @returns {Record<string, SyrupRecordCodec>}
   */
  const getChildCodecs = () => {
    return recordTypes;
  };
  /**
   * @param {SyrupReader} syrupReader
   * @returns {any}
   */
  const read = syrupReader => {
    syrupReader.enterRecord();
    const labelInfo = syrupReader.readRecordLabel();
    const labelString =
      labelInfo.type === 'bytestring'
        ? decodeImmutableArrayBufferToString(labelInfo.value)
        : labelInfo.value;
    const recordCodec = recordTable[labelString];
    if (!recordCodec) {
      throw Error(
        `${codecName}: Unexpected record type: ${quote(labelString)}`,
      );
    }
    const result = recordCodec.readBody(syrupReader);
    syrupReader.exitRecord();
    return result;
  };
  /**
   * @param {any} value
   * @param {SyrupWriter} syrupWriter
   */
  const write = (value, syrupWriter) => {
    if (typeof value !== 'object' || value === null) {
      throw Error(`${codecName}: Expected object, got ${typeof value}`);
    }
    const recordCodec = recordTable[value.type];
    if (!recordCodec) {
      throw Error(`${codecName}: Unexpected record type: ${quote(value.type)}`);
    }
    recordCodec.write(value, syrupWriter);
  };
  return freeze({
    read: makeCodecReadWithErrorWrapping(codecName, read),
    write: makeCodecWriteWithErrorWrapping(codecName, write),
    supports,
    getChildCodecs,
  });
};
