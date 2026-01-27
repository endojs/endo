/**
 * Common interface types for OCapN codec implementations (Syrup, CBOR).
 */

/**
 * Type hints returned by peekTypeHint() to indicate the category of
 * the next value without consuming it.
 */
export type TypeHint =
  | 'float64'
  | 'number-prefix'
  | 'list'
  | 'set'
  | 'dictionary'
  | 'record'
  | 'boolean';

/**
 * Result types for readTypeAndMaybeValue().
 */
export type TypeAndMaybeValue =
  | { type: 'boolean'; value: boolean }
  | { type: 'float64'; value: number }
  | { type: 'integer'; value: bigint }
  | { type: 'bytestring'; value: ArrayBufferLike }
  | { type: 'string'; value: string }
  | { type: 'selector'; value: string }
  | { type: 'null'; value: null }
  | { type: 'undefined'; value: undefined }
  | { type: 'list'; value: null }
  | { type: 'set'; value: null }
  | { type: 'dictionary'; value: null }
  | { type: 'record'; value: null };

/**
 * Record label information returned by readRecordLabel().
 */
export type RecordLabelInfo =
  | { type: 'selector'; value: string }
  | { type: 'string'; value: string }
  | { type: 'bytestring'; value: ArrayBufferLike };

/**
 * Common interface for OCapN readers (decoders).
 * Implemented by both SyrupReader and CborReader.
 */
export interface OcapnReader {
  name: string;
  index: number;

  readBoolean(): boolean;
  readInteger(): bigint;
  readFloat64(): number;
  readString(): string;
  readBytestring(): ArrayBufferLike;
  readSelectorAsString(): string;

  peekTypeHint(): TypeHint;
  readTypeAndMaybeValue(): TypeAndMaybeValue;

  enterRecord(): void;
  exitRecord(): void;
  peekRecordEnd(): boolean;
  readRecordLabel(): RecordLabelInfo;

  enterList(): void;
  exitList(): void;
  peekListEnd(): boolean;

  enterDictionary(): void;
  exitDictionary(): void;
  peekDictionaryEnd(): boolean;

  enterSet(): void;
  exitSet(): void;
  peekSetEnd(): boolean;
}

/**
 * Common interface for OCapN writers (encoders).
 * Implemented by both SyrupWriter and CborWriter.
 */
export interface OcapnWriter {
  name: string;
  index: number;

  writeBoolean(value: boolean): void;
  writeInteger(value: bigint): void;
  writeFloat64(value: number): void;
  writeString(value: string): void;
  writeBytestring(value: ArrayBufferLike): void;
  writeSelectorFromString(value: string): void;

  enterRecord(elementCount?: number): void;
  exitRecord(): void;

  enterList(elementCount?: number): void;
  exitList(): void;

  enterDictionary(pairCount?: number): void;
  exitDictionary(): void;

  enterSet(elementCount?: number): void;
  exitSet(): void;

  getBytes(): Uint8Array;
}

/**
 * Factory function type for creating readers.
 */
export type MakeReader = (
  bytes: Uint8Array,
  options?: { name?: string },
) => OcapnReader;

/**
 * Factory function type for creating writers.
 */
export type MakeWriter = (options?: {
  name?: string;
  length?: number;
}) => OcapnWriter;
