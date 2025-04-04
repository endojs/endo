import { SyrupRecordCodecType, RecordUnionCodec, SimpleSyrupCodecType, SyrupBooleanCodec, SyrupIntegerCodec, SyrupDoubleCodec, SyrupSymbolCodec, SyrupStringCodec, SyrupBytestringCodec, SyrupListCodec, SyrupStructCodec, CustomRecordCodec } from './codec.js';
import { DescAnswer, DescExport, DescImportObject, DescImportPromise } from './ocapn.js';

// OCapN Passable Atoms

const UndefinedCodec = new SimpleSyrupCodecType({
  unmarshal(syrupReader) {
    return undefined;
  },
  marshal(value, syrupWriter) {
    syrupWriter.enterRecord();
    syrupWriter.writeSymbol('void');
    syrupWriter.exitRecord();
  },
});

const NullCodec = new SimpleSyrupCodecType({
  unmarshal(syrupReader) {
    return null;
  },
  marshal(value, syrupWriter) {
    syrupWriter.enterRecord();
    syrupWriter.writeSymbol('null');
    syrupWriter.exitRecord();
  },
});


const AtomCodecs = {
  undefined: UndefinedCodec,
  null: NullCodec,
  boolean: SyrupBooleanCodec,
  integer: SyrupIntegerCodec,
  float64: SyrupDoubleCodec,
  string: SyrupStringCodec,
  // TODO: Pass Invariant Equality
  symbol: SyrupSymbolCodec,
  // TODO: Pass Invariant Equality
  byteArray: SyrupBytestringCodec,
}

// OCapN Passable Containers

// const OCapNTaggedCodec = new SyrupRecordCodecType(
//   'desc:tagged', [
//   ['tagName', 'symbol'],
//   // TODO: any type
//   ['value', 'any'],
// ])
const OCapNTaggedCodec = new CustomRecordCodec('desc:tagged', {
  unmarshalBody(syrupReader) {
    const tagName = syrupReader.readSymbolAsString();
    // @ts-expect-error any type
    const value = syrupReader.readOfType('any');
    // TODO: Pass Invariant Equality
    return {
      [Symbol.for('passStyle')]: 'tagged',
      [Symbol.toStringTag]: tagName,
      value,
    }
  },
  marshalBody(value, syrupWriter) {
    syrupWriter.writeSymbol(value.tagName);
    value.value.marshal(syrupWriter);
  },
  
})

const ContainerCodecs = {
  list: SyrupListCodec,
  struct: SyrupStructCodec,
  tagged: OCapNTaggedCodec,
}

// OCapN Reference (Capability)

const OCapNTargetCodec = new RecordUnionCodec({
  DescExport,
  DescImportObject,
})

const OCapNPromiseCodec = new RecordUnionCodec({
  DescImportPromise,
  DescAnswer,
})

const OCapNReferenceCodecs = {
  OCapNTargetCodec,
  OCapNPromiseCodec,
}

// OCapN Error

const OCapNErrorCodec = new SyrupRecordCodecType(
  'desc:error', [
  ['message', 'string'],
])

