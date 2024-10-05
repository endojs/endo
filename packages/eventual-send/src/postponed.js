/// <reference types="ses" />

/**
 * Create a simple postponedHandler that just postpones until donePostponing is
 * called.
 *
 * @param {import('./types.js').HandledPromiseConstructor} HandledPromise
 * @returns {[Required<import('./types.js').Handler<any>>, () => void]} postponedHandler and donePostponing callback.
 */
export const makePostponedHandler = HandledPromise => {
  /** @type {() => void} */
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

  /** @type {Required<import('./types.js').Handler<any>>} */
  const postponedHandler = {
    get: makePostponedOperation('get'),
    getSendOnly: makePostponedOperation('getSendOnly'),
    applyFunction: makePostponedOperation('applyFunction'),
    applyFunctionSendOnly: makePostponedOperation('applyFunctionSendOnly'),
    applyMethod: makePostponedOperation('applyMethod'),
    applyMethodSendOnly: makePostponedOperation('applyMethodSendOnly'),
  };

  // @ts-expect-error 2454
  assert(donePostponing);

  return [postponedHandler, donePostponing];
};
