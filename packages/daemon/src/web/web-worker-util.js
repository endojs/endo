import { makeQueue } from '@endo/stream';

const asyncIterFromQueue = async function *(queue) {
  while (true) {
    yield await queue.get();
  }
}

export const makeWebWorkerWriter = workerContext => {
  let index = 0;
  /** @type {import('@endo/stream').Writer<Uint8Array>} */
  const webWorkerWriter = harden({
    /** @param {Uint8Array} value */
    async next (value) {
      // console.log('worker writer "next"', value, { isInWorker: typeof window === 'undefined' })
      index++;
      workerContext.postMessage({ index, type: 'next', value });
    },
    async return (value) {
      // console.log('worker writer "return"', value, { isInWorker: typeof window === 'undefined' })
      index++;
      workerContext.postMessage({ index, type: 'return' });
    },
    /**
     * @param {Error} error
     */
    async throw (value) {
      // console.log('worker writer "throw"', value, { isInWorker: typeof window === 'undefined' })
      index++;
      workerContext.postMessage({ index, type: 'throw', value });
    },
    [Symbol.asyncIterator]() {
      return webWorkerWriter;
    },
  });
  return webWorkerWriter;
}

export const makeWebWorkerReader = workerContext => {

  const queue = makeQueue();
  // workerContext.addEventListener('message', event => {
  //   queue.put(event.data);
  // })
  // const iterator = asyncIterFromQueue(queue);

  const nextQueue = makeQueue();
  const returnQueue = makeQueue();
  const throwQueue = makeQueue();
  workerContext.addEventListener('message', event => {
    switch (event.data.type) {
      case 'next':
        // console.log('worker reader "next"', event.data, { isInWorker: typeof window === 'undefined' })
        queue.put({ value: event.data.value, done: false });
        break;
      case 'return':
        // console.log('worker reader "return"', event.data, { isInWorker: typeof window === 'undefined' })
        queue.put({ value: undefined, done: true });
        break;
      case 'throw':
        // console.log('worker reader "throw"', event.data, { isInWorker: typeof window === 'undefined' })
        queue.put(Promise.reject(event.data.value));
        break;
    }
  })

  // Adapt the AsyncIterator to the more strict interface of a Stream: must
  // have return and throw methods.
  /** @type {import('@endo/stream').Reader<Buffer>} */
  const reader = {
    async next() {
      // console.log('> webworker reader next requested', { isInWorker: typeof window === 'undefined' })
      const result = await queue.get();
      // console.log('< webworker reader next requested', result, { isInWorker: typeof window === 'undefined' })
      return result
    },
    async return() {
      // console.log('> webworker reader return requested', { isInWorker: typeof window === 'undefined' })
      debugger
      // const result = await returnQueue.get();
      // console.log('< webworker reader return requested', { isInWorker: typeof window === 'undefined' })
      // return result
    },
    async throw(error) {
      // console.log('> webworker reader throw requested', error, { isInWorker: typeof window === 'undefined' })
      // send error over to worker?
      // const result = await throwQueue.get();
      debugger
      // console.log('< webworker reader throw requested', error, { isInWorker: typeof window === 'undefined' })
      // return result
    },
    [Symbol.asyncIterator]() {
      return reader;
    },
  };

  return reader;
}