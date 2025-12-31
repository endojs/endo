// @ts-check

import { M } from '@endo/patterns';

/**
 * Interface for passable stream references.
 * The stream() method accepts the head of a synchronize promise chain and returns
 * the head of the acknowledge promise chain directly. E.get() pipelining handles
 * remote access to the promise chain nodes.
 *
 * Note: We use M.any() for stream arguments rather than a structured shape
 * because pattern validation of node values could reject large passable values
 * (e.g., bundles) due to default string length limits. Node structure validation
 * is done manually in the implementation.
 *
 * @see streamIterator - responder side for passable streams
 * @see iterateStream - initiator side for passable streams
 */
export const PassableStreamInterface = M.interface('PassableStream', {
  // stream(synPromise: ERef<StreamNode<TWrite, TWriteReturn>>): Promise<StreamNode<TRead, TReadReturn>>
  stream: M.call(M.any()).returns(M.promise()),
  // readPattern(): Pattern | undefined - pattern for TRead
  readPattern: M.call().returns(M.opt(M.pattern())),
  // readReturnPattern(): Pattern | undefined - pattern for TReadReturn
  readReturnPattern: M.call().returns(M.opt(M.pattern())),
  // writePattern(): Pattern | undefined - pattern for TWrite
  writePattern: M.call().returns(M.opt(M.pattern())),
  // writeReturnPattern(): Pattern | undefined - pattern for TWriteReturn
  writeReturnPattern: M.call().returns(M.opt(M.pattern())),
});

/**
 * Interface for passable bytes stream references.
 * Uses streamBase64() method instead of stream() to allow future migration
 * to a direct bytes stream() method when CapTP supports binary transport.
 *
 * No readPattern() method - the interface implies Uint8Array yields
 * (transmitted as base64 strings over the wire).
 *
 * @see streamBytesIterator - responder side for bytes readers
 * @see iterateBytesStream - initiator side for bytes readers
 */
export const PassableBytesReaderInterface = M.interface('PassableBytesReader', {
  // streamBase64(synPromise: ERef<StreamNode<Passable, Passable>>): Promise<StreamNode<string, TReadReturn>>
  streamBase64: M.call(M.any()).returns(M.promise()),
  // readReturnPattern(): Pattern | undefined - pattern for TReadReturn
  readReturnPattern: M.call().returns(M.opt(M.pattern())),
});
