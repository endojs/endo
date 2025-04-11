import {
  BooleanCodec,
  IntegerCodec,
  DoubleCodec,
  SymbolCodec,
  StringCodec,
  BytestringCodec,
  ListCodec,
  AnyCodec,
  makeRecordCodecFromDefinition,
  makeRecordCodec,
  makeRecordUnionCodec,
  makeUnionCodec,
} from '../codec.js';
import {
  DescImportObject,
  DescImportPromise,
  DescExport,
  DescAnswer,
  DescHandoffGive,
  DescHandoffReceive,
} from './descriptors.js';

/** @typedef {import('../codec.js').SyrupCodec} SyrupCodec */
/** @typedef {import('../codec.js').SyrupRecordCodec} SyrupRecordCodec */

// OCapN Passable Atoms

const UndefinedCodec = makeRecordCodec(
  'void',
  // readBody
  syrupReader => {
    return undefined;
  },
  // writeBody
  (value, syrupWriter) => {
    // body is empty
  },
);

const NullCodec = makeRecordCodec(
  'null',
  // readBody
  syrupReader => {
    return null;
  },
  // writeBody
  (value, syrupWriter) => {
    // body is empty
  },
);

const AtomCodecs = {
  undefined: UndefinedCodec,
  null: NullCodec,
  boolean: BooleanCodec,
  integer: IntegerCodec,
  float64: DoubleCodec,
  string: StringCodec,
  // TODO: Pass Invariant Equality
  symbol: SymbolCodec,
  // TODO: Pass Invariant Equality
  byteArray: BytestringCodec,
};

// OCapN Passable Containers

// TODO: dictionary but with only string keys
/** @type {SyrupCodec} */
export const OCapNStructCodec = {
  read(syrupReader) {
    throw Error('OCapNStructCodec: read must be implemented');
  },
  write(value, syrupWriter) {
    throw Error('OCapNStructCodec: write must be implemented');
  },
};

const OCapNTaggedCodec = makeRecordCodec(
  'desc:tagged',
  // readBody
  syrupReader => {
    const tagName = syrupReader.readSymbolAsString();
    // @ts-expect-error any type
    const value = syrupReader.readOfType('any');
    // TODO: Pass Invariant Equality
    return {
      [Symbol.for('passStyle')]: 'tagged',
      [Symbol.toStringTag]: tagName,
      value,
    };
  },
  // writeBody
  (value, syrupWriter) => {
    syrupWriter.writeSymbol(value.tagName);
    value.value.write(syrupWriter);
  },
);

const ContainerCodecs = {
  list: ListCodec,
  struct: OCapNStructCodec,
  tagged: OCapNTaggedCodec,
};

// OCapN Reference (Capability)

const OCapNTargetCodec = makeRecordUnionCodec({
  DescExport,
  DescImportObject,
});

const OCapNPromiseCodec = makeRecordUnionCodec({
  DescImportPromise,
  DescAnswer,
});

const OCapNReferenceCodecs = {
  OCapNTargetCodec,
  OCapNPromiseCodec,
};

// OCapN Error

const OCapNErrorCodec = makeRecordCodecFromDefinition('desc:error', [
  ['message', 'string'],
]);

// provided for completeness
const _OCapNPassableCodecs = {
  ...AtomCodecs,
  ...ContainerCodecs,
  ...OCapNReferenceCodecs,
  ...OCapNErrorCodec,
};

// all record based passables
const OCapNPassableRecordUnionCodec = makeRecordUnionCodec({
  UndefinedCodec,
  NullCodec,
  OCapNTaggedCodec,
  DescExport,
  DescImportObject,
  DescImportPromise,
  DescAnswer,
  DescHandoffGive,
  DescHandoffReceive,
  // DescSigGiveEnvelope,
  // DescSigReceiveEnvelope,
  OCapNErrorCodec,
});

export const OCapNPassableUnionCodec = makeUnionCodec(
  // selectCodecForRead
  syrupReader => {
    const typeHint = syrupReader.peekTypeHint();
    switch (typeHint) {
      case 'boolean':
        return AtomCodecs.boolean;
      case 'float64':
        return AtomCodecs.float64;
      case 'number-prefix':
        // can be string, bytestring, symbol, integer
        // We'll return the any codec in place of those
        return AnyCodec;
      case 'list':
        return ContainerCodecs.list;
      case 'record':
        // many possible matches, the union codec will select the correct one
        return OCapNPassableRecordUnionCodec;
      case 'dictionary':
        return ContainerCodecs.struct;
      default:
        throw Error(`Unknown type hint: ${typeHint}`);
    }
  },
  // selectCodecForWrite
  value => {
    if (value === undefined) {
      return AtomCodecs.undefined;
    }
    if (value === null) {
      return AtomCodecs.null;
    }
    if (typeof value === 'boolean') {
      return AtomCodecs.boolean;
    }
    if (typeof value === 'number') {
      return AtomCodecs.float64;
    }
    if (typeof value === 'string') {
      return AtomCodecs.string;
    }
    if (typeof value === 'symbol') {
      return AtomCodecs.symbol;
    }
    if (typeof value === 'bigint') {
      return AtomCodecs.integer;
    }
    if (value instanceof Uint8Array) {
      return AtomCodecs.byteArray;
    }
    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        return ContainerCodecs.list;
      }
      if (value[Symbol.for('passStyle')] === 'tagged') {
        return ContainerCodecs.tagged;
      }
      if (
        value.type !== undefined &&
        OCapNPassableRecordUnionCodec.supports(value.type)
      ) {
        return OCapNPassableRecordUnionCodec;
      }
      // TODO: need to distinguish OCapNReferenceCodecs and OCapNErrorCodec
      return ContainerCodecs.struct;
    }
    throw Error(`Unknown value: ${value}`);
  },
);
