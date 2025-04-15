const { freeze } = Object;
const quote = JSON.stringify;

/** @typedef {import('./decode.js').SyrupReader} SyrupReader */
/** @typedef {import('./encode.js').SyrupWriter} SyrupWriter */
/** @typedef {import('./decode.js').SyrupType} SyrupType */
/** @typedef {import('./decode.js').TypeHintTypes} TypeHintTypes */

/**
 * @typedef {object} SyrupCodec
 * @property {function(SyrupReader): any} read
 * @property {function(any, SyrupWriter): void} write
 */

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

/** @type {SyrupCodec} */
export const SelectorAsStringCodec = freeze({
  write: (value, syrupWriter) => syrupWriter.writeSelectorFromString(value),
  read: syrupReader => syrupReader.readSelectorAsString(),
});

/** @type {SyrupCodec} */
export const StringCodec = freeze({
  write: (value, syrupWriter) => syrupWriter.writeString(value),
  read: syrupReader => syrupReader.readString(),
});

/** @type {SyrupCodec} */
export const BytestringCodec = freeze({
  write: (value, syrupWriter) => syrupWriter.writeBytestring(value),
  read: syrupReader => syrupReader.readBytestring(),
});

/** @type {SyrupCodec} */
export const BooleanCodec = freeze({
  write: (value, syrupWriter) => syrupWriter.writeBoolean(value),
  read: syrupReader => syrupReader.readBoolean(),
});

/** @type {SyrupCodec} */
export const IntegerCodec = freeze({
  write: (value, syrupWriter) => syrupWriter.writeInteger(value),
  read: syrupReader => syrupReader.readInteger(),
});

/** @type {SyrupCodec} */
export const Float64Codec = freeze({
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

/** @type {SyrupCodec} */
export const NumberPrefixCodec = freeze({
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
    } else if (value instanceof Uint8Array) {
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
      throw Error('Codec function must return a codec');
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
 * @param {SyrupCodec} childCodec
 * @returns {SyrupCodec}
 */
export const makeSetCodecFromEntryCodec = childCodec => {
  return freeze({
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
      syrupWriter.enterSet();
      for (const child of value) {
        childCodec.write(child, syrupWriter);
      }
      syrupWriter.exitSet();
    },
  });
};

/**
 * @param {SyrupCodec} childCodec
 * @returns {SyrupCodec}
 */
export const makeListCodecFromEntryCodec = childCodec => {
  return freeze({
    read: syrupReader => {
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
      syrupWriter.enterList();
      for (const child of value) {
        childCodec.write(child, syrupWriter);
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
 * @param {string} label
 * @param {SyrupRecordLabelType} labelType
 * @param {function(SyrupReader): any} readBody
 * @param {function(any, SyrupWriter): void} writeBody
 * @returns {SyrupRecordCodec}
 */
export const makeRecordCodec = (label, labelType, readBody, writeBody) => {
  /**
   * @param {SyrupReader} syrupReader
   * @returns {any}
   */
  const read = syrupReader => {
    syrupReader.enterRecord();
    const labelInfo = syrupReader.readRecordLabel();
    if (labelInfo.type !== labelType) {
      throw Error(
        `RecordCodec: Expected label type ${quote(labelType)} for ${quote(label)}, got ${quote(labelInfo.type)}`,
      );
    }
    const labelString =
      labelInfo.type === 'bytestring'
        ? textDecoder.decode(labelInfo.value)
        : labelInfo.value;
    if (labelString !== label) {
      throw Error(
        `RecordCodec: Expected label ${quote(label)}, got ${quote(labelString)}`,
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
    syrupWriter.enterRecord();
    if (labelType === 'selector') {
      syrupWriter.writeSelectorFromString(value.type);
    } else if (labelType === 'string') {
      syrupWriter.writeString(value.type);
    } else if (labelType === 'bytestring') {
      syrupWriter.writeBytestring(textEncoder.encode(value.type));
    }
    writeBody(value, syrupWriter);
    syrupWriter.exitRecord();
  };
  return freeze({
    label,
    read,
    readBody,
    write,
    writeBody,
  });
};

/** @typedef {Array<[string, SyrupType | SyrupCodec]>} SyrupRecordDefinition */

/**
 * @param {string} label
 * @param {SyrupRecordLabelType} labelType
 * @param {SyrupRecordDefinition} definition
 * @returns {SyrupRecordCodec}
 */
export const makeRecordCodecFromDefinition = (label, labelType, definition) => {
  /**
   * @param {SyrupReader} syrupReader
   * @returns {any}
   */
  const readBody = syrupReader => {
    const result = {};
    for (const field of definition) {
      const [fieldName, fieldType] = field;
      const fieldCodec = resolveCodec(fieldType);
      result[fieldName] = fieldCodec.read(syrupReader);
    }
    result.type = label;
    return result;
  };
  /**
   * @param {any} value
   * @param {SyrupWriter} syrupWriter
   */
  const writeBody = (value, syrupWriter) => {
    for (const field of definition) {
      const [fieldName, fieldType] = field;
      const fieldValue = value[fieldName];
      const fieldCodec = resolveCodec(fieldType, fieldValue);
      fieldCodec.write(fieldValue, syrupWriter);
    }
  };

  return makeRecordCodec(label, labelType, readBody, writeBody);
};

/**
 * @param {function(SyrupReader): SyrupCodec} selectCodecForRead
 * @param {function(any): SyrupCodec} selectCodecForWrite
 * @returns {SyrupCodec}
 */
export const makeUnionCodec = (selectCodecForRead, selectCodecForWrite) => {
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
  return freeze({ read, write });
};

/** @typedef {'undefined'|'object'|'boolean'|'number'|'string'|'symbol'|'bigint'} JavascriptTypeofValueTypes */
/** @typedef {Partial<Record<TypeHintTypes, ResolvableCodec>>} TypeHintUnionReadTable */
/** @typedef {Partial<Record<JavascriptTypeofValueTypes, ResolvableCodec>>} TypeHintUnionWriteTable */

/**
 * @param {TypeHintUnionReadTable} readTable
 * @param {TypeHintUnionWriteTable} writeTable
 * @returns {SyrupCodec}
 */
export const makeTypeHintUnionCodec = (readTable, writeTable) => {
  return makeUnionCodec(
    syrupReader => {
      const typeHint = syrupReader.peekTypeHint();
      const codecRef = readTable[typeHint];
      if (!codecRef) {
        const expected = Object.keys(readTable).join(', ');
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
        const expected = Object.keys(writeTable).join(', ');
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
 * @typedef {SyrupCodec & {
 *   supports: (label: string) => boolean;
 * }} SyrupRecordUnionCodec
 */

/**
 * @param {Record<string, SyrupRecordCodec>} recordTypes
 * @returns {SyrupRecordUnionCodec}
 */
export const makeRecordUnionCodec = recordTypes => {
  const recordTable = Object.fromEntries(
    Object.values(recordTypes).map(recordCodec => {
      return [recordCodec.label, recordCodec];
    }),
  );
  const supports = label => {
    return recordTable[label] !== undefined;
  };
  const read = syrupReader => {
    syrupReader.enterRecord();
    const labelInfo = syrupReader.readRecordLabel();
    const labelString =
      labelInfo.type === 'bytestring'
        ? textDecoder.decode(labelInfo.value)
        : labelInfo.value;
    const recordCodec = recordTable[labelString];
    if (!recordCodec) {
      throw Error(`Unexpected record type: ${quote(labelString)}`);
    }
    const result = recordCodec.readBody(syrupReader);
    syrupReader.exitRecord();
    return result;
  };
  const write = (value, syrupWriter) => {
    const recordCodec = recordTable[value.type];
    if (!recordCodec) {
      throw Error(`Unexpected record type: ${quote(value.type)}`);
    }
    recordCodec.write(value, syrupWriter);
  };
  return freeze({ read, write, supports });
};
