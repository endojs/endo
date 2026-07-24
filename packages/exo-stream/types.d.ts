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
  TReadReturn extends Passable = Passable,
  TWriteReturn extends Passable = Passable,
> =
  | AsyncIterable<TRead, TReadReturn, TWrite>
  | Iterable<TRead, TReadReturn, TWrite>
  | AsyncIterator<TRead, TReadReturn, TWrite>
  | Iterator<TRead, TReadReturn, TWrite>;

/**
 * A yielding node in a bidirectional promise chain.
 */
export interface StreamYieldNode<
  Y extends Passable,
  R extends Passable = undefined,
> {
  /** The yielded value */
  value: Y;
  /** Next node */
  promise: Promise<StreamNode<Y, R>>;
}

/**
 * A return node in a bidirectional promise chain (final node).
 */
export interface StreamReturnNode<R extends Passable = undefined> {
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
export type StreamNode<
  Y extends Passable = undefined,
  R extends Passable = undefined,
> = StreamYieldNode<Y, R> | StreamReturnNode<R>;

/**
 * Options for makeReader (Reader stream responder).
 *
 * For Reader streams, synchronization values are undefined for flow control,
 * except the final synchronization node which carries the argument value
 * passed to the initiator's return(value) call when closing early. If the
 * responder is backed by a JavaScript iterator with a return(value) method,
 * it may replace that argument with its own return value.
 * Data flows from responder to initiator via the acknowledgement chain.
 */
export interface MakeReaderOptions<
  TRead extends Passable = Passable,
  TReadReturn extends Passable = undefined,
> {
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
 * - Synchronization values are `undefined` (flow control only), except the
 *   final node which carries `TReadReturn` when closing early
 * - Acknowledgement values are `TRead` (actual data)
 */
export interface PassableReader<
  TRead extends Passable = Passable,
  TReadReturn extends Passable = Passable,
> {
  stream(
    synPromise: ERef<StreamNode<undefined, TReadReturn>>,
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
 * - Synchronization values are `TWrite` (actual data from initiator). When the
 *   initiator calls `return(value)` to close early, the final syn node carries
 *   that argument value. If the responder is backed by a JavaScript iterator
 *   with a `return(value)` method, it forwards the argument and uses the
 *   iterator’s returned value as the terminal ack; otherwise it terminates with
 *   the original argument value.
 * - Acknowledgement values are `undefined` (flow control only)
 */
export interface PassableWriter<
  TWrite extends Passable = Passable,
  TWriteReturn extends Passable = Passable,
> {
  stream(
    synPromise: ERef<StreamNode<TWrite, TWriteReturn>>,
  ): Promise<StreamNode<undefined, TWriteReturn>>;
  /** Pattern for TWrite */
  writePattern(): Pattern | undefined;
  /** Pattern for TWriteReturn */
  writeReturnPattern(): Pattern | undefined;
}

/**
 * Local writer iterator returned by iterateWriter.
 * Ensures return() and throw() are present.
 */
export interface WriterIterator<
  TWrite = Passable,
  TWriteReturn extends Passable = undefined,
> extends AsyncIterableIterator<undefined, TWriteReturn, TWrite> {
  return(
    value?: TWriteReturn,
  ): Promise<IteratorResult<undefined, TWriteReturn>>;
  throw(error: any): Promise<IteratorResult<undefined, TWriteReturn>>;
}

/**
 * Local reader iterator returned by iterateReader.
 * Ensures return() and throw() are present.
 */
export interface ReaderIterator<
  TRead = Passable,
  TReadReturn extends Passable = undefined,
> extends AsyncIterableIterator<TRead, TReadReturn, undefined> {
  return(value?: TReadReturn): Promise<IteratorResult<TRead, TReadReturn>>;
  throw(error: any): Promise<IteratorResult<TRead, TReadReturn>>;
}

/**
 * A passable bytes reader reference.
 * Uses streamBase64() to allow future migration to direct bytes transport.
 * The final synchronization node carries the argument value passed to the
 * initiator's return(value) call when closing early; if the responder is backed
 * by a JavaScript iterator with a return(value) method, it may replace that
 * argument with its own return value. All other synchronization values are flow
 * control (`undefined`).
 * Yields base64-encoded strings (decoded to Uint8Array by initiator).
 */
export interface PassableBytesReader<TReadReturn extends Passable = undefined> {
  streamBase64(
    synPromise: ERef<StreamNode<Passable, TReadReturn>>,
  ): Promise<StreamNode<string, TReadReturn>>;
  /** Pattern for TReadReturn */
  readReturnPattern(): Pattern | undefined;
}

/**
 * A passable bytes writer reference.
 * Uses streamBase64() to allow future migration to direct bytes transport.
 * Receives base64-encoded strings (encoded from Uint8Array by initiator).
 * When the initiator calls `return(value)` to close early, the final syn node
 * carries that argument value. If the responder is backed by a JavaScript
 * iterator with a `return(value)` method, it forwards the argument and uses the
 * iterator’s returned value as the terminal ack; otherwise it terminates with
 * the original argument value.
 */
export interface PassableBytesWriter<
  TWriteReturn extends Passable = undefined,
> {
  streamBase64(
    synPromise: ERef<StreamNode<string, TWriteReturn>>,
  ): Promise<StreamNode<undefined, TWriteReturn>>;
  /** Pattern for TWriteReturn */
  writeReturnPattern(): Pattern | undefined;
}

/**
 * Local bytes writer iterator returned by iterateBytesWriter.
 * Ensures return() and throw() are present.
 */
export interface BytesWriterIterator<
  TWriteReturn extends Passable = undefined,
> extends WriterIterator<Uint8Array, TWriteReturn> {}

/**
 * Local bytes reader iterator returned by iterateBytesReader.
 * Ensures return() and throw() are present.
 */
export interface BytesReaderIterator<
  TReadReturn extends Passable = undefined,
> extends ReaderIterator<Uint8Array, TReadReturn> {}

/**
 * Options for makeReader pump.
 */
export interface ReaderPumpOptions {
  /** Number of values to pre-pull before waiting for synchronizes (default 0) */
  buffer?: number;
  /** Pattern for TRead (yielded values) */
  readPattern?: Pattern;
  /** Pattern for TReadReturn (return value) */
  readReturnPattern?: Pattern;
}

/**
 * Options for makeWriter pump.
 */
export interface WriterPumpOptions {
  /** Number of flow-control acks to pre-send before waiting for data (default 0) */
  buffer?: number;
  /** Pattern for TWrite (yielded values) */
  writePattern?: Pattern;
  /** Pattern for TWriteReturn (return value) */
  writeReturnPattern?: Pattern;
}

/**
 * Options for bytesReaderFromIterator.
 * TRead is fixed to Uint8Array (transmitted as base64 string).
 */
export interface MakeBytesReaderOptions<
  TReadReturn extends Passable = undefined,
> {
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
  TWrite extends Passable = Passable,
  TWriteReturn extends Passable = undefined,
> {
  /** Number of flow-control acks to pre-send before waiting for data (default 0) */
  buffer?: number;
  /** Pattern for TWrite (yielded values) */
  writePattern?: Pattern;
  /** Pattern for TWriteReturn (return value) */
  writeReturnPattern?: Pattern;
}

/**
 * Options for makeBufferedReader (push-fed Reader responder).
 *
 * There is deliberately no producer-side `buffer` bound: `push` is
 * fire-and-forget and the buffer is unbounded — a bound would require either
 * blocking the producer or dropping events. On the initiator, `iterateReader`'s
 * `buffer` option does not throttle this channel (the responder acknowledges
 * eagerly, never spending synchronize credit); it only pre-resolves
 * synchronize nodes, so `buffer: 0` is fine.
 */
export interface MakeBufferedReaderOptions<TRead extends Passable = Passable> {
  /**
   * Fires when the consumer stops pulling (return/throw) before the stream
   * finished, so the producer can be aborted. May also be set later via
   * `setOnClose`.
   */
  onClose?: (() => void) | null;
  /**
   * Predicate for terminal events, which are delivered in-band as values and
   * then auto-finalize the stream. Default: `type` of 'end' or 'abort'.
   */
  isTerminal?: (event: TRead) => boolean;
  /** Pattern each pushed event must match (validated at push time) */
  readPattern?: Pattern;
}

/**
 * A buffered reader reference. Structurally a `PassableReader` whose return
 * value is always `undefined`; the alias names the push-fed responder for
 * readability at call sites.
 */
export type BufferedReader<TRead extends Passable = Passable> = PassableReader<
  TRead,
  undefined
>;

/**
 * The kit returned by makeBufferedReader.
 */
export interface BufferedReaderKit<TRead extends Passable = Passable> {
  /** Fire-and-forget: buffer the event; ignored after the stream finishes */
  push: (event: TRead) => void;
  reader: BufferedReader<TRead>;
  /**
   * Close the channel from the producer side: discards undelivered events,
   * releases any parked consumer, and fires `onClose` exactly as an early
   * consumer close would. Idempotent, and a no-op once the stream finished.
   * This is how a producer aborts its own work (e.g. an `interrupt()` that
   * must kill the process feeding this channel).
   */
  close: () => void;
  /** True once a terminal event was pushed or the consumer closed early */
  isClosed: () => boolean;
  /** Replace the onClose hook (e.g. wired after construction) */
  setOnClose: (fn: () => void) => void;
}

/**
 * Options for iterateReader (Reader stream initiator).
 *
 * For Reader streams, synchronization values are undefined for flow control,
 * except the final node which carries the initiator's return value when closing early.
 */
export interface IterateReaderOptions<
  TRead extends Passable = Passable,
  TReadReturn extends Passable = undefined,
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
  TWrite extends Passable = Passable,
  TWriteReturn extends Passable = undefined,
> {
  /** Number of data values to pre-send before waiting for acks (default 0) */
  buffer?: number;
  /** Pattern to validate TWrite (yielded values) */
  writePattern?: Pattern;
  /** Pattern to validate TWriteReturn (return value) */
  writeReturnPattern?: Pattern;
}

/**
 * Options for iterateBytesReader.
 * TRead is fixed to Uint8Array.
 */
export interface IterateBytesReaderOptions<
  TReadReturn extends Passable = undefined,
> {
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
export interface MakeBytesWriterOptions<
  TWriteReturn extends Passable = undefined,
> {
  /** Number of flow-control acks to pre-send before waiting for data (default 0) */
  buffer?: number;
  /** Pattern for TWriteReturn (return value) */
  writeReturnPattern?: Pattern;
}

/**
 * Options for iterateBytesWriter.
 * TWrite is fixed to Uint8Array.
 */
export interface IterateBytesWriterOptions<
  TWriteReturn extends Passable = undefined,
> {
  /** Number of data values to pre-send before waiting for acks (default 0) */
  buffer?: number;
}
