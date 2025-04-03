
export class SyrupCodec {
  /**
   * @param {import('./decode.js').SyrupReader} syrupReader
   */
  unmarshal(syrupReader) {
    throw new Error('SyrupCodec: unmarshal must be implemented');
  }
  /**
   * @param {any} value
   * @param {import('./encode.js').SyrupWriter} syrupWriter
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

export class SyrupRecordCodecType extends SyrupCodec {
  /**
   * @param {string} label
   * @param {Array<[string, string | SyrupCodec]>} definition
   */
  // TODO: improve definition type to restricted strings
  constructor(label, definition) {
    super();
    this.label = label;
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
  marshal(value, syrupWriter) {
    syrupWriter.enterRecord();
    syrupWriter.writeSymbol(value.type);
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
    syrupWriter.exitRecord();
  }
}

export class RecordUnionCodec extends SyrupCodec {
  /**
   * @param {Record<string, SyrupRecordCodecType>} recordTypes
   */
  constructor(recordTypes) {
    super();
    this.recordTypes = recordTypes;
    this.recordTable = Object.fromEntries(
      Object.values(recordTypes).map(recordCodec => [recordCodec.label, recordCodec])
    );
  }
  unmarshal(syrupReader) {
    syrupReader.enterRecord();
    const label = syrupReader.readSymbolAsString();
    const recordCodec = this.recordTable[label];
    if (!recordCodec) {
      throw Error(`Unknown record type: ${label}`);
    }
    const result = recordCodec.unmarshalBody(syrupReader);
    syrupReader.exitRecord();
    return result;
  }
  marshal(value, syrupWriter) {
    const { type } = value;
    const recordCodec = this.recordTable[type];
    if (!recordCodec) {
      throw Error(`Unknown record type: ${type}`);
    }
    recordCodec.marshal(value, syrupWriter);
  }
}

// export class SyrupListCodec extends SyrupCodec {
//   /**
//    * @param {SyrupCodec[]} definition
//    */
//   constructor(definition) {
//     super();
//     this.definition = definition;
//   }
//   /**
//    * @param {import('./decode.js').SyrupReader} syrupReader
//    */
//   unmarshal(syrupReader) {
//     syrupReader.enterList();
//     const result = [];
//     for (const entry of this.definition) {
//       result.push(entry.unmarshal(syrupReader));
//     }
//     syrupReader.exitList();
//     return result;
//   }
//   /**
//    * @param {any} value
//    * @param {import('./encode.js').SyrupWriter} syrupWriter
//    */
//   marshal(value, syrupWriter) {
//     return this.definition.map((entry, index) => entry.marshal(value[index], syrupWriter));
//   }
// }