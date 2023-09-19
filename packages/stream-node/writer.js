/* Adapts a Node.js stream to an Writer<Uint8Array>, where a writer stream is
 * modeled as a hybrid async iterator + generator.
 */

// @ts-check
/// <reference types="ses"/>

const { Fail } = assert;

const sink = harden(() => {});

const makePromise = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const makeQueue = () => {
  const ends = makePromise();
  return {
    put(value) {
      const next = makePromise();
      const promise = next.promise;
      ends.resolve({ value, promise });
      ends.resolve = next.resolve;
    },
    get() {
      const promise = ends.promise.then(next => next.value);
      ends.promise = ends.promise.then(next => next.promise);
      return promise;
    },
  };
};

const makeMutex = () => {
  const current = makeQueue();
  const unlock = () => {
    current.put();
  }
  const lock = () => {
    return current.get();
  }
  unlock();
  return {
    lock,
    unlock
  };
}

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

  let finalized = false;
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
      finalized = true;
      writer.off('error', error);
      writer.off('finish', finalize);
      writer.off('close', finalize);
      // Prevent Node 14 from triggering a global unhandled error if we race
      writer.on('error', sink);
    };
    // Streams should emit either error or finish and then may emit close.
    // So, watching close is redundant but makes us feel safer.
    writer.on('error', error);
    writer.on('finish', finalize);
    writer.on('close', finalize);
  });

  const nonFinalIterationResult = harden({ done: false, value: undefined });
  const mutex = makeMutex();

  /** @type {import('@endo/stream').Writer<Uint8Array>} */
  const nodeWriter = harden({
    /** @param {Uint8Array} value */
    async next(value) {
      !finalized || Fail`Cannot write into closed Node stream`;
      return Promise.race([
        finalIteration,
        (async () => {
          try {
            await mutex.lock();
            for (const chunk of getChunks(value, 65536)) {
              await writeChunk(writer, chunk)
              // if you remove this it breaks
              await new Promise(resolve => setTimeout(resolve, 0))
              // await new Promise(resolve => setImmediate(resolve))
            }
            return nonFinalIterationResult;
          } finally {
            mutex.unlock();
          }
        })(),
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

function writeChunk (writer, value) {
  return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
    if (
      !writer.write(value, err => {
        if (err) reject(err);
      })
    ) {
      writer.once('drain', () => {
        resolve();
      });
    } else {
      resolve();
    }
  }))
}

function getChunks (buffer, chunkSize) {
  const chunks = []
  for (let i = 0; i < buffer.length; i += chunkSize) {
    chunks.push(buffer.slice(i, i + chunkSize))
  }
  return chunks
}