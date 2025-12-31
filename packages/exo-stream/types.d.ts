import type { Passable } from '@endo/pass-style';
import type { ERef } from '@endo/eventual-send';
import type { Pattern } from '@endo/patterns';

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
 * Options for streamIterator.
 */
export interface StreamIteratorOptions<
  TRead = Passable,
  TWrite = undefined,
  TReadReturn = undefined,
  TWriteReturn = undefined,
> {
  /** Number of values to pre-pull before waiting for synchronizes (default 0) */
  buffer?: number;
  /** Pattern for TRead (yielded values) */
  readPattern?: Pattern;
  /** Pattern for TReadReturn (return value) */
  readReturnPattern?: Pattern;
  /** Pattern for TWrite (next() values) */
  writePattern?: Pattern;
  /** Pattern for TWriteReturn (return() value) */
  writeReturnPattern?: Pattern;
}

/**
 * A passable stream reference, analogous to Stream<TRead, TWrite, TReadReturn, TWriteReturn>.
 */
export interface PassableStream<
  TRead = Passable,
  TWrite = Passable,
  TReadReturn = Passable,
  TWriteReturn = Passable,
> {
  stream(
    synPromise: ERef<StreamNode<TWrite, TWriteReturn>>,
  ): Promise<StreamNode<TRead, TReadReturn>>;
  /** Pattern for TRead */
  readPattern(): Pattern | undefined;
  /** Pattern for TReadReturn */
  readReturnPattern(): Pattern | undefined;
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
 * Options for streamBytesIterator.
 * TRead is fixed to Uint8Array (transmitted as base64 string).
 */
export interface StreamBytesIteratorOptions<TReadReturn = undefined> {
  /** Number of values to pre-pull before waiting for synchronizes (default 0) */
  buffer?: number;
  /** Pattern for TReadReturn (return value) */
  readReturnPattern?: Pattern;
}

/**
 * Options for iterateStream.
 */
export interface IterateStreamOptions<
  TRead = Passable,
  TWrite = undefined,
  TReadReturn = undefined,
  TWriteReturn = unknown,
> {
  /** Number of values to pre-synchronize (default 1) */
  buffer?: number;
  /** Pattern to validate TRead (yielded values) */
  readPattern?: Pattern;
  /** Pattern to validate TReadReturn (return value) */
  readReturnPattern?: Pattern;
}

/**
 * Options for iterateBytesStream.
 * TRead is fixed to Uint8Array.
 */
export interface IterateBytesStreamOptions<TReadReturn = undefined> {
  /** Number of values to pre-synchronize (default 1) */
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
