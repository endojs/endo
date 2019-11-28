/* global HandledPromise SES */

import makeE from './E';

// 'E' and 'HandledPromise' are exports of the module

// For now:
// import { HandledPromise, E } from '@agoric/eventual-send';
// ...

// eslint-disable-next-line import/no-mutable-exports
let hp;
if (typeof HandledPromise === 'undefined') {
  // Export a fresh shim.
  // eslint-disable-next-line no-use-before-define
  hp = makeHandledPromise();
} else {
  // Reuse the global or endowed HandledPromise.
  hp = HandledPromise;
}

// Provide our exports.
export { hp as HandledPromise };
export const E = makeE(hp);

// the following method (makeHandledPromise) is part
// of the shim, and will not be exported by the module once the feature
// becomes a part of standard javascript

/**
 * Create a HandledPromise class to have it support eventual send
 * (wavy-dot) operations.
 *
 * Based heavily on nanoq
 * https://github.com/drses/nanoq/blob/master/src/nanoq.js
 *
 * Original spec for the infix-bang (predecessor to wavy-dot) desugaring:
 * https://web.archive.org/web/20161026162206/http://wiki.ecmascript.org/doku.php?id=strawman:concurrency
 *
 * @return {typeof HandledPromise} Handled promise
 */
function makeHandledPromise() {
  const harden = (typeof SES !== 'undefined' && SES.harden) || Object.freeze;

  // xs doesn't support WeakMap in pre-loaded closures
  // aka "vetted customization code"
  let presenceToHandler;
  let presenceToPromise;
  let promiseToHandler;
  function ensureMaps() {
    if (!presenceToHandler) {
      presenceToHandler = new WeakMap();
      presenceToPromise = new WeakMap();
      promiseToHandler = new WeakMap();
    }
  }

  // This special handler accepts Promises, and forwards
  // handled Promises to their corresponding fulfilledHandler.
  let forwardingHandler;
  let handle;
  let baseResolve;

  class HandledPromise extends Promise {
    static get(target, key) {
      return handle(target, 'get', key);
    }

    static getSendOnly(target, key) {
      handle(target, 'get', key);
    }

    static applyFunction(target, args) {
      return handle(target, 'applyMethod', undefined, args);
    }

    static applyFunctionSendOnly(target, args) {
      handle(target, 'applyMethod', undefined, args);
    }

    static applyMethod(target, key, args) {
      return handle(target, 'applyMethod', key, args);
    }

    static applyMethodSendOnly(target, key, args) {
      handle(target, 'applyMethod', key, args);
    }

    static resolve(value) {
      ensureMaps();
      // Resolving a Presence returns the pre-registered handled promise.
      const handledPromise = presenceToPromise.get(value);
      if (handledPromise) {
        return handledPromise;
      }
      return baseResolve(value);
    }

    constructor(executor, unfulfilledHandler = undefined) {
      let handledResolve;
      let handledReject;
      let fulfilled = false;
      super((resolve, reject) => {
        handledResolve = value => {
          fulfilled = true;
          resolve(value);
        };
        handledReject = err => {
          fulfilled = true;
          reject(err);
        };
      });

      const handledP = harden(this);

      ensureMaps();
      let continueForwarding = () => {};

      if (!unfulfilledHandler) {
        // Create a simple unfulfilledHandler that just postpones until the
        // fulfilledHandler is set.
        //
        // This is insufficient for actual remote handled Promises
        // (too many round-trips), but is an easy way to create a
        // local handled Promise.
        const interlockP = new Promise((resolve, reject) => {
          continueForwarding = (err = null, targetP = undefined) => {
            if (err !== null) {
              reject(err);
              return;
            }
            // Box the target promise so that it isn't further resolved.
            resolve([targetP]);
            // Return undefined.
          };
        });

        const makePostponed = postponedOperation => {
          // Just wait until the handler is resolved/rejected.
          return function postpone(x, ...args) {
            // console.log(`forwarding ${postponedOperation} ${args[0]}`);
            return new HandledPromise((resolve, reject) => {
              interlockP
                .then(([targetP]) => {
                  // If targetP is a handled promise, use it, otherwise x.
                  const nextPromise = targetP || x;
                  resolve(
                    HandledPromise[postponedOperation](nextPromise, ...args),
                  );
                })
                .catch(reject);
            });
          };
        };

        unfulfilledHandler = {
          get: makePostponed('get'),
          applyMethod: makePostponed('applyMethod'),
        };
      }

      const validateHandler = h => {
        if (Object(h) !== h) {
          throw TypeError(`Handler ${h} cannot be a primitive`);
        }
      };
      validateHandler(unfulfilledHandler);

      // Until the handled promise is resolved, we use the unfulfilledHandler.
      promiseToHandler.set(handledP, unfulfilledHandler);

      const rejectHandled = reason => {
        if (fulfilled) {
          return;
        }
        handledReject(reason);
        continueForwarding(reason);
      };

      let resolvedPresence = null;
      const resolveWithPresence = presenceHandler => {
        if (fulfilled) {
          return resolvedPresence;
        }
        try {
          // Sanity checks.
          validateHandler(presenceHandler);

          // Validate and install our mapped target (i.e. presence).
          resolvedPresence = Object.create(null);

          // Create table entries for the presence mapped to the
          // fulfilledHandler.
          presenceToPromise.set(resolvedPresence, handledP);
          presenceToHandler.set(resolvedPresence, presenceHandler);

          // Remove the mapping, as our presenceHandler should be
          // used instead.
          promiseToHandler.delete(handledP);

          // We committed to this presence, so resolve.
          handledResolve(resolvedPresence);
          continueForwarding();
          return resolvedPresence;
        } catch (e) {
          handledReject(e);
          continueForwarding();
          throw e;
        }
      };

      const resolveHandled = async (target, deprecatedPresenceHandler) => {
        if (fulfilled) {
          return undefined;
        }
        try {
          if (deprecatedPresenceHandler) {
            throw TypeError(
              `resolveHandled no longer accepts a handler; use resolveWithPresence`,
            );
          }

          // Resolve with the target when it's ready.
          handledResolve(target);

          const existingUnfulfilledHandler = promiseToHandler.get(target);
          if (existingUnfulfilledHandler) {
            // Reuse the unfulfilled handler.
            promiseToHandler.set(handledP, existingUnfulfilledHandler);
            return continueForwarding(null, target);
          }

          // See if the target is a presence we already know of.
          const presence = await target;
          const existingPresenceHandler = presenceToHandler.get(presence);
          if (existingPresenceHandler) {
            promiseToHandler.set(handledP, existingPresenceHandler);
            return continueForwarding(null, handledP);
          }

          // Remove the mapping, as we don't need a handler.
          promiseToHandler.delete(handledP);
          return continueForwarding();
        } catch (e) {
          handledReject(e);
        }
        return continueForwarding();
      };

      // Invoke the callback to let the user resolve/reject.
      executor(
        (...args) => {
          resolveHandled(...args);
        },
        rejectHandled,
        resolveWithPresence,
      );
    }
  }

  function makeForwarder(operation, localImpl) {
    return (o, ...args) => {
      // We are in another turn already, and have the naked object.
      const fulfilledHandler = presenceToHandler.get(o);
      if (
        fulfilledHandler &&
        typeof fulfilledHandler[operation] === 'function'
      ) {
        // The handler was resolved, so use it.
        return fulfilledHandler[operation](o, ...args);
      }

      // Not handled, so use the local implementation.
      return localImpl(o, ...args);
    };
  }

  // eslint-disable-next-line prefer-const
  forwardingHandler = {
    get: makeForwarder('get', (o, key) => o[key]),
    applyMethod: makeForwarder('applyMethod', (o, optKey, args) => {
      if (optKey === undefined || optKey === null) {
        return o(...args);
      }
      // console.log(`sending`, optKey, o[optKey], o);
      if (typeof o[optKey] !== 'function') {
        throw TypeError(`o[${JSON.stringify(optKey)}] is not a function`);
      }
      return o[optKey](...args);
    }),
  };

  handle = (p, operation, ...args) => {
    ensureMaps();
    const unfulfilledHandler = promiseToHandler.get(p);
    let executor;
    if (
      unfulfilledHandler &&
      typeof unfulfilledHandler[operation] === 'function'
    ) {
      executor = (resolve, reject) => {
        // We run in a future turn to prevent synchronous attacks,
        HandledPromise.resolve()
          .then(() =>
            // and resolve to the answer from the specific unfulfilled handler,
            resolve(unfulfilledHandler[operation](p, ...args)),
          )
          .catch(reject);
      };
    } else {
      executor = (resolve, reject) => {
        // We run in a future turn to prevent synchronous attacks,
        HandledPromise.resolve(p)
          .then(o => {
            // We now have the naked object,
            if (typeof forwardingHandler[operation] !== 'function') {
              throw TypeError(
                `forwardingHandler.${operation} is not a function`,
              );
            }
            // and resolve to the forwardingHandler's operation.
            resolve(forwardingHandler[operation](o, ...args));
          })
          .catch(reject);
      };
    }

    // We return a handled promise with the default unfulfilled handler.
    // This prevents a race between the above Promise.resolves and
    // pipelining.
    return new HandledPromise(executor);
  };

  baseResolve = Promise.resolve.bind(HandledPromise);
  return harden(HandledPromise);
}
