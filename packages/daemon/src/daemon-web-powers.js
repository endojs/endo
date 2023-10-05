// @ts-check
import { makeQueue } from '@endo/stream';

import {
  makeCryptoPowers,
  makeFilePowers,
  makeDaemonicPersistencePowers,
} from './daemon-node-powers.js';
import { makePetStoreMaker } from './pet-store.js';

export {
  // I would prefer to use the web-crypto API, but the hash operations are async
  // so we just use node-powers with browserify-crypto.
  makeCryptoPowers,
  makeFilePowers,
};

/**
 * @param {object} opts
 * @param {import('./types.js').Locator} opts.locator
 * @param {typeof import('url')} opts.url
 * @param {import('./types.js').FilePowers} opts.filePowers
 * @param {import('./types.js').CryptoPowers} opts.cryptoPowers
 * @param {() => Worker} opts.makeWebWorker
 * @returns {import('./types.js').DaemonicPowers}
 */
export const makeDaemonicPowers = ({
  locator,
  url,
  filePowers,
  cryptoPowers,
  makeWebWorker,
}) => {
  const { fileURLToPath } = url;

  const petStorePowers = makePetStoreMaker(filePowers, locator);
  const daemonicPersistencePowers = makeDaemonicPersistencePowers(
    fileURLToPath,
    filePowers,
    cryptoPowers,
    locator,
    false,
  );
  const daemonicControlPowers = makeDaemonicControlPowers(
    locator,
    filePowers,
    makeWebWorker,
  );

  return harden({
    crypto: cryptoPowers,
    petStore: petStorePowers,
    persistence: daemonicPersistencePowers,
    control: daemonicControlPowers,
  });
};

export const makeWebWorkerWriter = workerContext => {
  const finalIterationResult = harden({ done: true, value: undefined });
  const nonFinalIterationResult = harden({ done: false, value: undefined });
  /** @type {import('@endo/stream').Writer<Uint8Array>} */
  const webWorkerWriter = harden({
    /** @param {Uint8Array} value */
    async next(value) {
      workerContext.postMessage({ type: 'next', value });
      return nonFinalIterationResult;
    },
    async return(value) {
      workerContext.postMessage({ type: 'return', value });
      return finalIterationResult;
    },
    /**
     * @param {Error} error
     */
    async throw(error) {
      workerContext.postMessage({ type: 'throw', value: error });
      return finalIterationResult;
    },
    [Symbol.asyncIterator]() {
      return webWorkerWriter;
    },
  });
  return webWorkerWriter;
};

export const makeWebWorkerReader = workerContext => {
  const finalIterationResult = harden({ done: true, value: undefined });

  const queue = makeQueue();
  workerContext.addEventListener('message', event => {
    switch (event.data.type) {
      case 'next':
        queue.put({ value: event.data.value, done: false });
        break;
      case 'return':
        queue.put({ value: undefined, done: true });
        break;
      case 'throw':
        queue.put(Promise.reject(event.data.value));
        break;
    }
  });

  // Adapt the AsyncIterator to the more strict interface of a Stream: must
  // have return and throw methods.
  /** @type {import('@endo/stream').Reader<Buffer>} */
  const reader = {
    async next() {
      return queue.get();
    },
    // @ts-ignore
    async return() {
      return finalIterationResult;
    },
    // @ts-ignore
    async throw(error) {
      console.log('> webworker reader throw requested', error, {
        isInWorker: typeof window === 'undefined',
      });
      return finalIterationResult;
    },
    [Symbol.asyncIterator]() {
      return reader;
    },
  };

  return reader;
};

/**
 * @param {import('./types.js').Locator} locator
 * @param {import('./types.js').FilePowers} filePowers
 * @param {() => Worker} makeWebWorker
 */
export const makeDaemonicControlPowers = (locator, filePowers, makeWebWorker) => {
  const { cachePath, statePath, ephemeralStatePath } = locator;

  /**
   * @param {string} id
   * @param {Promise<never>} cancelled
   */
  const makeWorker = async (id, cancelled) => {
    const workerCachePath = filePowers.joinPath(cachePath, 'worker-id512', id);
    const workerStatePath = filePowers.joinPath(statePath, 'worker-id512', id);
    const workerEphemeralStatePath = filePowers.joinPath(
      ephemeralStatePath,
      'worker-id512',
      id,
    );

    await Promise.all([
      filePowers.makePath(workerStatePath),
      filePowers.makePath(workerEphemeralStatePath),
    ]);

    const worker = makeWebWorker();

    const workerReadyP = new Promise(resolve =>
      worker.addEventListener('message', resolve, { once: true }),
    );

    const reader = makeWebWorkerReader(worker);
    const writer = makeWebWorkerWriter(worker);

    const workerClosed = new Promise(resolve => {});

    await workerReadyP;
    worker.postMessage({
      type: 'ENDO_WORKER_INIT',
      id,
      statePath: workerStatePath,
      ephemeralStatePath: workerEphemeralStatePath,
      cachePath: workerCachePath,
    });

    return {
      reader,
      writer,
      closed: workerClosed,
      pid: 0,
    };
  };

  return harden({
    makeWorker,
  });
};
