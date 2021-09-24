// @ts-check
/// <reference types="ses" />

/**
 * @template T
 * @typedef {import('.').EHandler<T>} EHandler
 */

/**
 * @param {import('.').HandledPromiseConstructor} HandledPromise
 * @returns {[Required<EHandler<any>>, () => void]}
 */
export const makePostponedHandler = HandledPromise => {
  // Create a simple postponedHandler that just postpones until the
  // fulfilledHandler is set.
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
            // If targetP is a handled promise, use it, otherwise x.
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
