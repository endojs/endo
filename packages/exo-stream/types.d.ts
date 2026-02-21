import type { Passable } from '@endo/pass-style';
import type { ERef } from '@endo/eventual-send';
import type { Pattern } from '@endo/patterns';

/**
 * A type that can be iterated asynchronously.
 * Mirrors Stream<TRead, TWrite, TReadReturn, TWriteReturn> template parameters.
 * The `@endo/stream` Stream type is also accepted since it extends AsyncIterator.
 */
export type SomehowAsyncIterable<
  TRead,
  TWrite = undefined,
  TReadReturn = unknown,
  TWriteReturn = unknown,
> =
  | AsyncIterable<TRead, TReadReturn, TWrite>
  | Iterable<TRead, TReadReturn, TWrite>
  | AsyncIterator<TRead, TReadReturn, TWrite>
  | Iterator<TRead, TReadReturn, TWrite>;

/**
 * A yielding node in a bidirectional promise chain.
 */
export interface StreamYieldNode<Y, R = undefined> {
  /** The yielded value */
  value: Y;
  /** Next node */
  promise: Promise<StreamNode<Y, R>>;
}

/**
 * A return node in a bidirectional promise chain (final node).
 */
export interface StreamReturnNode<R = undefined> {
  /** The return value */
  value: R;
  /** null signals end of chain */
  promise: null;
}

/**
 * A node in a bidirectional promise chain.
 * Like IteratorResult, this is a discriminated union:
 * - Yield node: {value: Y, promise: Promise<StreamNode<Y, R>>}
 * - Return node: {value: R, promise: null}
 *
 * The same structure is used for both directions:
 * - Synchronize chain: initiator → responder (next() values, close signals)
 * - Acknowledge chain: responder → initiator (yields/returns)
 */
export type StreamNode<Y = undefined, R = undefined> =
  | StreamYieldNode<Y, R>
  | StreamReturnNode<R>;

/**
 * Options for makeReader (Reader stream responder).
 *
 * For Reader streams, synchronization values are always undefined (flow control only).
 * Data flows from responder to initiator via the acknowledgement chain.
 */
export interface MakeReaderOptions<TRead = Passable, TReadReturn = undefined> {
  /** Number of values to pre-pull before waiting for synchronizes (default 0) */
  buffer?: number;
  /** Pattern for TRead (yielded values) */
  readPattern?: Pattern;
  /** Pattern for TReadReturn (return value) */
  readReturnPattern?: Pattern;
}

/**
 * A passable Reader reference.
 *
 * For Reader streams:
 * - Synchronization values are `undefined` (flow control only)
 * - Acknowledgement values are `TRead` (actual data)
 */
export interface PassableReader<TRead = Passable, TReadReturn = Passable> {
  stream(
    synPromise: ERef<StreamNode<undefined, Passable>>,
  ): Promise<StreamNode<TRead, TReadReturn>>;
  /** Pattern for TRead */
  readPattern(): Pattern | undefined;
  /** Pattern for TReadReturn */
  readReturnPattern(): Pattern | undefined;
}

/**
 * A passable Writer reference.
 *
 * For Writer streams:
 * - Synchronization values are `TWrite` (actual data from initiator)
 * - Acknowledgement values are `undefined` (flow control only)
 */
export interface PassableWriter<TWrite = Passable, TWriteReturn = Passable> {
  stream(
    synPromise: ERef<StreamNode<TWrite, Passable>>,
  ): Promise<StreamNode<undefined, TWriteReturn>>;
  /** Pattern for TWrite */
  writePattern(): Pattern | undefined;
  /** Pattern for TWriteReturn */
  writeReturnPattern(): Pattern | undefined;
}

/**
 * A passable bytes reader reference.
 * Uses streamBase64() to allow future migration to direct bytes transport.
 * Yields base64-encoded strings (decoded to Uint8Array by initiator).
 */
export interface PassableBytesReader<TReadReturn = undefined> {
  streamBase64(
    synPromise: ERef<StreamNode<Passable, Passable>>,
  ): Promise<StreamNode<string, TReadReturn>>;
  /** Pattern for TReadReturn */
  readReturnPattern(): Pattern | undefined;
}

/**
 * A passable bytes writer reference.
 * Uses streamBase64() to allow future migration to direct bytes transport.
 * Receives base64-encoded strings (encoded from Uint8Array by initiator).
 */
export interface PassableBytesWriter<TWriteReturn = undefined> {
  streamBase64(
    synPromise: ERef<StreamNode<string, Passable>>,
  ): Promise<StreamNode<undefined, TWriteReturn>>;
  /** Pattern for TWriteReturn */
  writeReturnPattern(): Pattern | undefined;
}

/**
 * Options for makeReader pump.
 */
export interface ReaderPumpOptions {
  /** Number of values to pre-pull before waiting for synchronizes (default 0) */
  buffer?: number;
}

/**
 * Options for makeWriter pump.
 */
export interface WriterPumpOptions {
  /** Number of flow-control acks to pre-send before waiting for data (default 0) */
  buffer?: number;
}

/**
 * Options for bytesReaderFromIterator.
 * TRead is fixed to Uint8Array (transmitted as base64 string).
 */
export interface MakeBytesReaderOptions<TReadReturn = undefined> {
  /** Number of values to pre-pull before waiting for synchronizes (default 0) */
  buffer?: number;
  /** Pattern for TReadReturn (return value) */
  readReturnPattern?: Pattern;
}

/**
 * Options for makeWriter (Writer stream responder).
 *
 * For Writer streams, acknowledgement values are always undefined (flow control only).
 * Data flows from initiator to responder via the synchronization chain.
 */
export interface MakeWriterOptions<
  TWrite = Passable,
  TWriteReturn = undefined,
> {
  /** Number of flow-control acks to pre-send before waiting for data (default 0) */
  buffer?: number;
  /** Pattern for TWrite (yielded values) */
  writePattern?: Pattern;
  /** Pattern for TWriteReturn (return value) */
  writeReturnPattern?: Pattern;
}

/**
 * Options for iterateReader (Reader stream initiator).
 *
 * For Reader streams, synchronization values are always undefined (flow control only).
 */
export interface IterateReaderOptions<
  TRead = Passable,
  TReadReturn = undefined,
> {
  /** Number of values to pre-synchronize (default 0) */
  buffer?: number;
  /** Pattern to validate TRead (yielded values) */
  readPattern?: Pattern;
  /** Pattern to validate TReadReturn (return value) */
  readReturnPattern?: Pattern;
}

/**
 * Options for iterateWriter (Writer stream initiator).
 *
 * For Writer streams, acknowledgement values are always undefined (flow control only).
 */
export interface IterateWriterOptions<
  TWrite = Passable,
  TWriteReturn = undefined,
> {
  /** Number of data values to pre-send before waiting for acks (default 0) */
  buffer?: number;
}

/**
 * Options for iterateBytesReader.
 * TRead is fixed to Uint8Array.
 */
export interface IterateBytesReaderOptions<TReadReturn = undefined> {
  /** Number of values to pre-synchronize (default 0) */
  buffer?: number;
  /** Pattern for TReadReturn (return value) */
  readReturnPattern?: Pattern;
  /**
   * Maximum length for base64-encoded chunks in characters.
   * The default is 100,000 (from @endo/patterns default limits).
   * Increase this for large payloads like bundles.
   * Note: base64 encoding increases size by ~33%, so a 75KB binary payload
   * becomes ~100KB of base64 text.
   */
  stringLengthLimit?: number;
}

/**
 * Options for bytesWriterFromIterator.
 * TWrite is fixed to Uint8Array (transmitted as base64 string).
 */
export interface MakeBytesWriterOptions<TWriteReturn = undefined> {
  /** Number of flow-control acks to pre-send before waiting for data (default 0) */
  buffer?: number;
  /** Pattern for TWriteReturn (return value) */
  writeReturnPattern?: Pattern;
}

/**
 * Options for iterateBytesWriter.
 * TWrite is fixed to Uint8Array.
 */
export interface IterateBytesWriterOptions<TWriteReturn = undefined> {
  /** Number of data values to pre-send before waiting for acks (default 0) */
  buffer?: number;
}
