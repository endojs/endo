const quote = JSON.stringify;

export class SyrupCodec {
  /**
   * @param {import('./decode.js').SyrupReader} syrupReader
   * @returns {any}
   */
  unmarshal(syrupReader) {
    throw new Error('SyrupCodec: unmarshal must be implemented');
  }
  /**
   * @param {any} value
   * @param {import('./encode.js').SyrupWriter} syrupWriter
   * @returns {void}
   */
  marshal(value, syrupWriter) {
    throw new Error('SyrupCodec: marshal must be implemented');
  }
}

export class SimpleSyrupCodecType extends SyrupCodec {
  /**
   * @param {object} options
   * @param {function(any, import('./encode.js').SyrupWriter): void} options.marshal
   * @param {function(import('./decode.js').SyrupReader): any} options.unmarshal
   */
  constructor ({ marshal, unmarshal }) {
    super();
    this.marshal = marshal;
    this.unmarshal = unmarshal;
  }
  /**
   * @param {import('./decode.js').SyrupReader} syrupReader
   */
  unmarshal(syrupReader) {
    this.unmarshal(syrupReader);
  }
  /**
   * @param {any} value
   * @param {import('./encode.js').SyrupWriter} syrupWriter
   */
  marshal(value, syrupWriter) {
    this.marshal(value, syrupWriter);
  }
}

export const SyrupSymbolCodec = new SimpleSyrupCodecType({
  marshal: (value, syrupWriter) => syrupWriter.writeSymbol(value),
  unmarshal: (syrupReader) => syrupReader.readSymbolAsString(),
});

export const SyrupStringCodec = new SimpleSyrupCodecType({
  marshal: (value, syrupWriter) => syrupWriter.writeString(value),
  unmarshal: (syrupReader) => syrupReader.readString(),
});

export const SyrupBytestringCodec = new SimpleSyrupCodecType({
  marshal: (value, syrupWriter) => syrupWriter.writeBytestring(value),
  unmarshal: (syrupReader) => syrupReader.readBytestring(),
});

export const SyrupBooleanCodec = new SimpleSyrupCodecType({
  marshal: (value, syrupWriter) => syrupWriter.writeBoolean(value),
  unmarshal: (syrupReader) => syrupReader.readBoolean(),
});

export const SyrupIntegerCodec = new SimpleSyrupCodecType({
  marshal: (value, syrupWriter) => syrupWriter.writeInteger(value),
  unmarshal: (syrupReader) => syrupReader.readInteger(),
});

export const SyrupDoubleCodec = new SimpleSyrupCodecType({
  marshal: (value, syrupWriter) => syrupWriter.writeDouble(value),
  unmarshal: (syrupReader) => syrupReader.readFloat64(),
});

export const SyrupAnyCodec = new SimpleSyrupCodecType({
  marshal: (value, syrupWriter) => syrupWriter.writeAny(value),
  unmarshal: (syrupReader) => syrupReader.readAny(),
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
  unmarshal(syrupReader) {
    syrupReader.enterRecord();
    const label = syrupReader.readSymbolAsString();
    if (label !== this.label) {
      throw Error(`Expected label ${this.label}, got ${label}`);
    }
    const result = this.unmarshalBody(syrupReader);
    syrupReader.exitRecord();
    return result;
  }
  /**
   * @param {import('./decode.js').SyrupReader} syrupReader
   */
  unmarshalBody(syrupReader) {
    throw Error('SyrupRecordCodecType: unmarshalBody must be implemented');
  }
  /**
   * @param {any} value
   * @param {import('./encode.js').SyrupWriter} syrupWriter
   */
  marshal(value, syrupWriter) {
    syrupWriter.enterRecord();
    syrupWriter.writeSymbol(value.type);
    this.marshalBody(value, syrupWriter);
    syrupWriter.exitRecord();
  }
  /**
   * @param {any} value
   * @param {import('./encode.js').SyrupWriter} syrupWriter
   */
  marshalBody(value, syrupWriter) {
    throw Error('SyrupRecordCodecType: marshalBody must be implemented');
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
        throw new Error('SyrupRecordCodec: The "type" field is reserved for internal use.');
      }
    }
  }
  /**
   * @param {import('./decode.js').SyrupReader} syrupReader
   */
  unmarshalBody(syrupReader) {
    const result = {};
    for (const field of this.definition) {
      const [fieldName, fieldType] = field;
      let fieldValue;
      if (typeof fieldType === 'string') {
        // @ts-expect-error fieldType is any string
        fieldValue = syrupReader.readOfType(fieldType);
      } else {
        const fieldDefinition = fieldType;
        fieldValue = fieldDefinition.unmarshal(syrupReader);
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
  marshalBody(value, syrupWriter) {
    for (const field of this.definition) {
      const [fieldName, fieldType] = field;
      const fieldValue = value[fieldName];
      if (typeof fieldType === 'string') {
        // @ts-expect-error fieldType is any string
        syrupWriter.writeOfType(fieldType, fieldValue);
      } else {
        fieldType.marshal(fieldValue, syrupWriter);
      }
    }
  }
}

// TODO: vestigial "definition" argument
export class CustomRecordCodec extends SyrupRecordCodecType {
  /**
   * @param {string} label
   * @param {object} options
   * @param {function(any, import('./encode.js').SyrupWriter): void} options.marshalBody
   * @param {function(import('./decode.js').SyrupReader): any} options.unmarshalBody
   */
  constructor(label, { marshalBody, unmarshalBody }) {
    super(label);
    this.marshalBody = marshalBody;
    this.unmarshalBody = unmarshalBody;
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
        return [recordCodec.label, recordCodec]
      })
    );
  }
  supports(label) {
    return this.recordTable[label] !== undefined;
  }
  unmarshal(syrupReader) {
    syrupReader.enterRecord();
    const label = syrupReader.readSymbolAsString();
    const recordCodec = this.recordTable[label];
    if (!recordCodec) {
      throw Error(`Unexpected record type: ${quote(label)}`);
    }
    const result = recordCodec.unmarshalBody(syrupReader);
    syrupReader.exitRecord();
    return result;
  }
  marshal(value, syrupWriter) {
    const { type } = value;
    const recordCodec = this.recordTable[type];
    if (!recordCodec) {
      throw Error(`Unexpected record type: ${quote(type)}`);
    }
    recordCodec.marshal(value, syrupWriter);
  }
}

export const SyrupListCodec = new SimpleSyrupCodecType({
  unmarshal(syrupReader) {
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
  marshal(value, syrupWriter) {
    throw Error('SyrupListCodec: marshal must be implemented');
  },
});

export class CustomUnionCodecType extends SyrupCodec {
  /**
   * @param {object} options
   * @param {function(import('./decode.js').SyrupReader): SyrupCodec} options.selectCodecForUnmarshal
   * @param {function(any): SyrupCodec} options.selectCodecForMarshal
   */
  constructor ({ selectCodecForUnmarshal, selectCodecForMarshal }) {
    super();
    this.selectCodecForUnmarshal = selectCodecForUnmarshal;
    this.selectCodecForMarshal = selectCodecForMarshal;
  }
  unmarshal(syrupReader) {
    const codec = this.selectCodecForUnmarshal(syrupReader);
    return codec.unmarshal(syrupReader);
  }
  marshal(value, syrupWriter) {
    const codec = this.selectCodecForMarshal(value);
    codec.marshal(value, syrupWriter);
  }
}

