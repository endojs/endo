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
    // Named so stack traces and `.name` keep reporting `postpone` for
    // postponed operations, without reintroducing the `function` keyword.
    const postpone = (x, ...args) =>
      // console.log(`forwarding ${postponedOperation} ${args[0]}`);
      new HandledPromise((resolve, reject) => {
        interlockP
          .then(_ => {
            resolve(HandledPromise[postponedOperation](x, ...args));
          })
          .catch(reject);
      });
    return postpone;
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
