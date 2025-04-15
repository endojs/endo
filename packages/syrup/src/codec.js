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
export const SelectorCodec = freeze({
  write: (value, syrupWriter) => syrupWriter.writeSelector(value),
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

/** @type {SyrupCodec} */
export const AnyCodec = freeze({
  write: (value, syrupWriter) => syrupWriter.writeAny(value),
  read: syrupReader => syrupReader.readAny(),
});

/** @type {SyrupCodec} */
export const ListCodec = freeze({
  /**
   * @param {SyrupReader} syrupReader
   * @returns {any[]}
   */
  read(syrupReader) {
    syrupReader.enterList();
    const result = [];
    while (!syrupReader.peekListEnd()) {
      const value = syrupReader.readAny();
      result.push(value);
    }
    syrupReader.exitList();
    return result;
  },
  /**
   * @param {any} value
   * @param {SyrupWriter} syrupWriter
   */
  write(value, syrupWriter) {
    throw Error('SyrupListCodec: write must be implemented');
  },
});

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
      syrupWriter.writeSelector(value.type);
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
      let fieldValue;
      if (typeof fieldType === 'string') {
        // @ts-expect-error fieldType is any string
        fieldValue = syrupReader.readOfType(fieldType);
      } else {
        const fieldDefinition = fieldType;
        fieldValue = fieldDefinition.read(syrupReader);
      }
      result[fieldName] = fieldValue;
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
      if (typeof fieldType === 'string') {
        // @ts-expect-error fieldType is any string
        syrupWriter.writeOfType(fieldType, fieldValue);
      } else {
        fieldType.write(fieldValue, syrupWriter);
      }
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
/** @typedef {Partial<Record<TypeHintTypes, SyrupCodec>>} TypeHintUnionReadTable */
/** @typedef {Partial<Record<JavascriptTypeofValueTypes, SyrupCodec | ((any) => SyrupCodec)>>} TypeHintUnionWriteTable */

/**
 * @param {TypeHintUnionReadTable} readTable
 * @param {TypeHintUnionWriteTable} writeTable
 * @returns {SyrupCodec}
 */
export const makeTypeHintUnionCodec = (readTable, writeTable) => {
  return makeUnionCodec(
    syrupReader => {
      const typeHint = syrupReader.peekTypeHint();
      const codec = readTable[typeHint];
      if (!codec) {
        const expected = Object.keys(readTable).join(', ');
        throw Error(
          `Unexpected type hint ${quote(typeHint)}, expected one of ${expected}`,
        );
      }
      return codec;
    },
    value => {
      const codecOrGetter = writeTable[typeof value];
      const codec =
        typeof codecOrGetter === 'function'
          ? codecOrGetter(value)
          : codecOrGetter;
      if (!codec) {
        const expected = Object.keys(writeTable).join(', ');
        throw Error(
          `Unexpected value type ${quote(typeof value)}, expected one of ${expected}`,
        );
      }
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
