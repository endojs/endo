// @ts-check

import { M } from '@endo/patterns';

/**
 * Interface for passable Reader references.
 *
 * For Reader streams:
 * - Synchronization values are `undefined` (flow control only). When the
 *   initiator calls `return(value)` to close early, the final syn node carries
 *   that argument value. If the responder is backed by a JavaScript iterator
 *   with a `return(value)` method, it forwards the argument and uses the
 *   iterator’s returned value as the terminal ack; otherwise it terminates with
 *   the original argument value.
 * - Acknowledgement values are `TRead` (actual data)
 *
 * The stream() method accepts the head of a synchronize promise chain and returns
 * the head of the acknowledge promise chain directly. E.get() pipelining handles
 * remote access to the promise chain nodes.
 *
 * Note: We use M.any() for stream arguments rather than a structured shape
 * because pattern validation of node values could reject large passable values
 * (e.g., bundles) due to default string length limits. Node structure validation
 * is done manually in the implementation.
 *
 * @see readerFromIterator - responder side for passable readers
 * @see iterateReader - initiator side for passable readers
 */
export const PassableReaderInterface = M.interface('PassableReader', {
  // stream(synPromise: ERef<StreamNode<undefined, TReadReturn>>): Promise<StreamNode<TRead, TReadReturn>>
  stream: M.call(M.any()).returns(M.promise()),
  // readPattern(): Pattern | undefined - pattern for TRead
  readPattern: M.call().returns(M.opt(M.pattern())),
  // readReturnPattern(): Pattern | undefined - pattern for TReadReturn
  readReturnPattern: M.call().returns(M.opt(M.pattern())),
});

/**
 * Interface for passable Writer references.
 *
 * For Writer streams:
 * - Synchronization values are `TWrite` (actual data from initiator). When the
 *   initiator calls `return(value)` to close early, the final syn node carries
 *   that argument value. If the responder is backed by a JavaScript iterator
 *   with a `return(value)` method, it forwards the argument and uses the
 *   iterator’s returned value as the terminal ack; otherwise it terminates with
 *   the original argument value.
 * - Acknowledgement values are `undefined` (flow control only)
 *
 * The stream() method accepts the head of a synchronize data chain and returns
 * the head of the acknowledge flow-control chain.
 *
 * @see writerFromIterator - responder side for passable writers
 * @see iterateWriter - initiator side for passable writers
 */
export const PassableWriterInterface = M.interface('PassableWriter', {
  // stream(synPromise: ERef<StreamNode<TWrite, TWriteReturn>>): Promise<StreamNode<undefined, TWriteReturn>>
  stream: M.call(M.any()).returns(M.promise()),
  // writePattern(): Pattern | undefined - pattern for TWrite
  writePattern: M.call().returns(M.opt(M.pattern())),
  // writeReturnPattern(): Pattern | undefined - pattern for TWriteReturn
  writeReturnPattern: M.call().returns(M.opt(M.pattern())),
});

/**
 * Interface for passable bytes reader references.
 * Uses streamBase64() method instead of stream() to allow future migration
 * to a direct bytes stream() method when CapTP supports binary transport.
 *
 * No readPattern() method - the interface implies Uint8Array yields
 * (transmitted as base64 strings over the wire).
 *
 * @see bytesReaderFromIterator - responder side for bytes readers
 * @see iterateBytesReader - initiator side for bytes readers
 */
export const PassableBytesReaderInterface = M.interface('PassableBytesReader', {
  // streamBase64(synPromise: ERef<StreamNode<Passable, TReadReturn>>): Promise<StreamNode<string, TReadReturn>>
  streamBase64: M.call(M.any()).returns(M.promise()),
  // readReturnPattern(): Pattern | undefined - pattern for TReadReturn
  readReturnPattern: M.call().returns(M.opt(M.pattern())),
});

/**
 * Interface for passable bytes writer references.
 * Uses streamBase64() method instead of stream() to allow future migration
 * to a direct bytes stream() method when CapTP supports binary transport.
 *
 * No writePattern() method - the interface implies Uint8Array writes. When the
 * initiator calls `return(value)` to close early, the final syn node carries
 * that argument value. If the responder is backed by a JavaScript iterator with
 * a `return(value)` method, it forwards the argument and uses the iterator’s
 * returned value as the terminal ack; otherwise it terminates with the original
 * argument value.
 * (transmitted as base64 strings over the wire).
 *
 * @see bytesWriterFromIterator - responder side for bytes writers
 * @see iterateBytesWriter - initiator side for bytes writers
 */
export const PassableBytesWriterInterface = M.interface('PassableBytesWriter', {
  // streamBase64(synPromise: ERef<StreamNode<string, TWriteReturn>>): Promise<StreamNode<undefined, TWriteReturn>>
  streamBase64: M.call(M.any()).returns(M.promise()),
  // writeReturnPattern(): Pattern | undefined - pattern for TWriteReturn
  writeReturnPattern: M.call().returns(M.opt(M.pattern())),
});
