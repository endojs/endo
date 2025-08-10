/**
 * A LazyPromise doesn't run its executor until .then, .catch, or .finally is called,
 * or the promise is awaited.
 * Unfortunately, `@endo/promise-kit`'s isPromise returns false for instances of LazyPromise.
 * However, LazyPromise instances will return true for instanceof Promise.
 */
export class LazyPromise extends Promise {
  #isListening = false;

  #executor;

  #resolve;

  #reject;

  static get [Symbol.species]() {
    return Promise;
  }

  constructor(executor) {
    let resolve;
    let reject;
    super((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.#executor = executor;
    this.#resolve = resolve;
    this.#reject = reject;
  }

  #setListening() {
    if (this.#isListening) return;
    this.#isListening = true;
    this.#executor(this.#resolve, this.#reject);
  }

  then(onFulfilled, onRejected) {
    this.#setListening();
    return super.then(onFulfilled, onRejected);
  }

  catch(onRejected) {
    this.#setListening();
    return super.catch(onRejected);
  }

  finally(onFinally) {
    this.#setListening();
    return super.finally(onFinally);
  }
}

harden(LazyPromise);
