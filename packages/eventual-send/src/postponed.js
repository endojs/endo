/// <reference types="ses" />

/**
 * @template T
 * @typedef {import('.').EHandler<T>} EHandler
 */

/**
 * Create a simple postponedHandler that just postpones until donePostponing is
 * called.
 *
 * @param {import('.').HandledPromiseConstructor} HandledPromise
 * @returns {[Required<EHandler<any>>, () => void]} A pair consisting of the
 * postponedHandler and donePostponing callback.
 */
export const makePostponedHandler = HandledPromise => {
  let donePostponing;
  const interlockP = new Promise(resolve => {
    donePostponing = () => resolve(undefined);
  });

  const makePostponedOperation = postponedOperation => {
    // Just wait until the handler is resolved/rejected.
    return function postpone(x, ...args) {
      // console.log(`forwarding ${postponedOperation} ${args[0]}`);
      return new HandledPromise((resolve, reject) => {
        interlockP
          .then(_ => {
            resolve(HandledPromise[postponedOperation](x, ...args));
          })
          .catch(reject);
      });
    };
  };

  /** @type {Required<EHandler<any>>} */
  const postponedHandler = {
    get: makePostponedOperation('get'),
    getSendOnly: makePostponedOperation('getSendOnly'),
    applyFunction: makePostponedOperation('applyFunction'),
    applyFunctionSendOnly: makePostponedOperation('applyFunctionSendOnly'),
    applyMethod: makePostponedOperation('applyMethod'),
    applyMethodSendOnly: makePostponedOperation('applyMethodSendOnly'),
  };

  assert(donePostponing);
  return [postponedHandler, donePostponing];
};
