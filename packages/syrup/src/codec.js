const quote = JSON.stringify;

export class SyrupCodec {
  /**
   * @param {import('./decode.js').SyrupReader} syrupReader
   * @returns {any}
   */
  read(syrupReader) {
    throw new Error('SyrupCodec: read must be implemented');
  }

  /**
   * @param {any} value
   * @param {import('./encode.js').SyrupWriter} syrupWriter
   * @returns {void}
   */
  write(value, syrupWriter) {
    throw new Error('SyrupCodec: write must be implemented');
  }
}

export class SimpleSyrupCodecType extends SyrupCodec {
  /**
   * @param {object} options
   * @param {function(any, import('./encode.js').SyrupWriter): void} options.write
   * @param {function(import('./decode.js').SyrupReader): any} options.read
   */
  constructor({ write, read }) {
    super();
    this.write = write;
    this.read = read;
  }

  /**
   * @param {import('./decode.js').SyrupReader} syrupReader
   */
  read(syrupReader) {
    this.read(syrupReader);
  }

  /**
   * @param {any} value
   * @param {import('./encode.js').SyrupWriter} syrupWriter
   */
  write(value, syrupWriter) {
    this.write(value, syrupWriter);
  }
}

export const SyrupSymbolCodec = new SimpleSyrupCodecType({
  write: (value, syrupWriter) => syrupWriter.writeSymbol(value),
  read: syrupReader => syrupReader.readSymbolAsString(),
});

export const SyrupStringCodec = new SimpleSyrupCodecType({
  write: (value, syrupWriter) => syrupWriter.writeString(value),
  read: syrupReader => syrupReader.readString(),
});

export const SyrupBytestringCodec = new SimpleSyrupCodecType({
  write: (value, syrupWriter) => syrupWriter.writeBytestring(value),
  read: syrupReader => syrupReader.readBytestring(),
});

export const SyrupBooleanCodec = new SimpleSyrupCodecType({
  write: (value, syrupWriter) => syrupWriter.writeBoolean(value),
  read: syrupReader => syrupReader.readBoolean(),
});

export const SyrupIntegerCodec = new SimpleSyrupCodecType({
  write: (value, syrupWriter) => syrupWriter.writeInteger(value),
  read: syrupReader => syrupReader.readInteger(),
});

export const SyrupDoubleCodec = new SimpleSyrupCodecType({
  write: (value, syrupWriter) => syrupWriter.writeDouble(value),
  read: syrupReader => syrupReader.readFloat64(),
});

export const SyrupAnyCodec = new SimpleSyrupCodecType({
  write: (value, syrupWriter) => syrupWriter.writeAny(value),
  read: syrupReader => syrupReader.readAny(),
});

export class SyrupRecordCodecType extends SyrupCodec {
  /**
   * @param {string} label
   */
  constructor(label) {
    super();
    this.label = label;
  }

  /**
   * @param {import('./decode.js').SyrupReader} syrupReader
   */
  read(syrupReader) {
    syrupReader.enterRecord();
    const label = syrupReader.readSymbolAsString();
    if (label !== this.label) {
      throw Error(`Expected label ${this.label}, got ${label}`);
    }
    const result = this.readBody(syrupReader);
    syrupReader.exitRecord();
    return result;
  }

  /**
   * @param {import('./decode.js').SyrupReader} syrupReader
   */
  readBody(syrupReader) {
    throw Error('SyrupRecordCodecType: readBody must be implemented');
  }

  /**
   * @param {any} value
   * @param {import('./encode.js').SyrupWriter} syrupWriter
   */
  write(value, syrupWriter) {
    syrupWriter.enterRecord();
    syrupWriter.writeSymbol(value.type);
    this.writeBody(value, syrupWriter);
    syrupWriter.exitRecord();
  }

  /**
   * @param {any} value
   * @param {import('./encode.js').SyrupWriter} syrupWriter
   */
  writeBody(value, syrupWriter) {
    throw Error('SyrupRecordCodecType: writeBody must be implemented');
  }
}
export class SyrupStructuredRecordCodecType extends SyrupRecordCodecType {
  /**
   * @param {string} label
   * @param {Array<[string, string | SyrupCodec]>} definition
   */
  // TODO: improve definition type to restricted strings
  constructor(label, definition) {
    super(label);
    this.definition = definition;
    for (const [fieldName] of definition) {
      if (fieldName === 'type') {
        throw new Error(
          'SyrupRecordCodec: The "type" field is reserved for internal use.',
        );
      }
    }
  }

  /**
   * @param {import('./decode.js').SyrupReader} syrupReader
   */
  readBody(syrupReader) {
    const result = {};
    for (const field of this.definition) {
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
    result.type = this.label;
    return result;
  }

  /**
   * @param {any} value
   * @param {import('./encode.js').SyrupWriter} syrupWriter
   */
  writeBody(value, syrupWriter) {
    for (const field of this.definition) {
      const [fieldName, fieldType] = field;
      const fieldValue = value[fieldName];
      if (typeof fieldType === 'string') {
        // @ts-expect-error fieldType is any string
        syrupWriter.writeOfType(fieldType, fieldValue);
      } else {
        fieldType.write(fieldValue, syrupWriter);
      }
    }
  }
}

// TODO: vestigial "definition" argument
export class CustomRecordCodec extends SyrupRecordCodecType {
  /**
   * @param {string} label
   * @param {object} options
   * @param {function(any, import('./encode.js').SyrupWriter): void} options.writeBody
   * @param {function(import('./decode.js').SyrupReader): any} options.readBody
   */
  constructor(label, { writeBody, readBody }) {
    super(label);
    this.writeBody = writeBody;
    this.readBody = readBody;
  }
}

export class RecordUnionCodec extends SyrupCodec {
  /**
   * @param {Record<string, SyrupRecordCodecType>} recordTypes
   */
  constructor(recordTypes) {
    super();
    this.recordTypes = recordTypes;
    const labelSet = new Set();
    this.recordTable = Object.fromEntries(
      Object.values(recordTypes).map(recordCodec => {
        if (labelSet.has(recordCodec.label)) {
          throw Error(`Duplicate record type: ${recordCodec.label}`);
        }
        labelSet.add(recordCodec.label);
        return [recordCodec.label, recordCodec];
      }),
    );
  }

  supports(label) {
    return this.recordTable[label] !== undefined;
  }

  read(syrupReader) {
    syrupReader.enterRecord();
    const label = syrupReader.readSymbolAsString();
    const recordCodec = this.recordTable[label];
    if (!recordCodec) {
      throw Error(`Unexpected record type: ${quote(label)}`);
    }
    const result = recordCodec.readBody(syrupReader);
    syrupReader.exitRecord();
    return result;
  }

  write(value, syrupWriter) {
    const { type } = value;
    const recordCodec = this.recordTable[type];
    if (!recordCodec) {
      throw Error(`Unexpected record type: ${quote(type)}`);
    }
    recordCodec.write(value, syrupWriter);
  }
}

export const SyrupListCodec = new SimpleSyrupCodecType({
  read(syrupReader) {
    syrupReader.enterList();
    const result = [];
    while (!syrupReader.peekListEnd()) {
      const value = syrupReader.readAny();
      console.log('readAny', value);
      result.push(value);
    }
    syrupReader.exitList();
    return result;
  },
  write(value, syrupWriter) {
    throw Error('SyrupListCodec: write must be implemented');
  },
});

export class CustomUnionCodecType extends SyrupCodec {
  /**
   * @param {object} options
   * @param {function(import('./decode.js').SyrupReader): SyrupCodec} options.selectCodecForRead
   * @param {function(any): SyrupCodec} options.selectCodecForWrite
   */
  constructor({ selectCodecForRead, selectCodecForWrite }) {
    super();
    this.selectCodecForRead = selectCodecForRead;
    this.selectCodecForWrite = selectCodecForWrite;
  }

  read(syrupReader) {
    const codec = this.selectCodecForRead(syrupReader);
    return codec.read(syrupReader);
  }

  write(value, syrupWriter) {
    const codec = this.selectCodecForWrite(value);
    codec.write(value, syrupWriter);
  }
}
