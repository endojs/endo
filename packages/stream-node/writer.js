/* Adapts a Node.js stream to an Writer<Uint8Array>, where a writer stream is
 * modeled as a hybrid async iterator + generator.
 */

// @ts-check
/// <reference types="ses"/>

const { Fail } = assert;

/**
 * Adapts a Node.js writable stream to a JavaScript
 * async iterator of Uint8Array data chunks.
 * Back pressure emerges from awaiting on the promise
 * returned by `next` before calling `next` again.
 *
 * @param {import('stream').Writable} writer the destination Node.js writer
 * @returns {import('@endo/stream').Writer<Uint8Array>}
 */
export const makeNodeWriter = writer => {
  !writer.writableObjectMode ||
    Fail`Cannot convert Node.js object mode Writer to AsyncIterator<undefined, Uint8Array>`;

  const finalIteration = new Promise((resolve, reject) => {
    const finalize = () => {
      // eslint-disable-next-line no-use-before-define
      cleanup();
      resolve(harden({ done: true, value: undefined }));
    };
    const error = err => {
      // eslint-disable-next-line no-use-before-define
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      writer.off('error', error);
      writer.off('finish', finalize);
      writer.off('close', finalize);
    };
    // Streams should emit either error or finish and then may emit close.
    // So, watching close is redundant but makes us feel safer.
    writer.on('error', error);
    writer.on('finish', finalize);
    writer.on('close', finalize);
  });

  const nonFinalIterationResult = harden({ done: false, value: undefined });

  /** @type {import('@endo/stream').Writer<Uint8Array>} */
  const nodeWriter = harden({
    /** @param {Uint8Array} value */
    async next(value) {
      return Promise.race([
        finalIteration,
        new Promise(resolve => {
          if (!writer.write(value)) {
            writer.once('drain', () => {
              resolve(nonFinalIterationResult);
            });
          } else {
            resolve(nonFinalIterationResult);
          }
        }),
      ]);
    },
    async return() {
      writer.end();
      return finalIteration;
    },
    /**
     * @param {Error} error
     */
    async throw(error) {
      writer.destroy(error);
      return finalIteration;
    },
    [Symbol.asyncIterator]() {
      return nodeWriter;
    },
  });
  return nodeWriter;
};
harden(makeNodeWriter);
