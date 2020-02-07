/* global HandledPromise */

import harden from '@agoric/harden';

import makeE from './E';

const {
  defineProperties,
  getOwnPropertyDescriptors,
  getOwnPropertyDescriptor: gopd,
  getPrototypeOf,
  isFrozen,
} = Object;

const { prototype: promiseProto } = Promise;
const { then: originalThen } = promiseProto;

// 'E' and 'HandledPromise' are exports of the module

// For now:
// import { HandledPromise, E } from '@agoric/eventual-send';
// ...

const hp =
  typeof HandledPromise === 'undefined'
    ? // eslint-disable-next-line no-use-before-define
      makeHandledPromise(Promise)
    : harden(HandledPromise);

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
export function makeHandledPromise(Promise) {
  // xs doesn't support WeakMap in pre-loaded closures
  // aka "vetted customization code"
  let presenceToHandler;
  let presenceToPromise;
  let promiseToHandler;
  let promiseToPresence; // only for HandledPromise.unwrap
  function ensureMaps() {
    if (!presenceToHandler) {
      presenceToHandler = new WeakMap();
      presenceToPromise = new WeakMap();
      promiseToHandler = new WeakMap();
      promiseToPresence = new WeakMap();
    }
  }

  // This special handler accepts Promises, and forwards
  // handled Promises to their corresponding fulfilledHandler.
  let forwardingHandler;
  let handle;
  let promiseResolve;

  function HandledPromise(executor, unfulfilledHandler = undefined) {
    if (new.target === undefined) {
      throw new Error('must be invoked with "new"');
    }
    let handledResolve;
    let handledReject;
    let fulfilled = false;
    const superExecutor = (resolve, reject) => {
      handledResolve = value => {
        fulfilled = true;
        resolve(value);
      };
      handledReject = err => {
        fulfilled = true;
        reject(err);
      };
    };
    const handledP = harden(
      Reflect.construct(Promise, [superExecutor], new.target),
    );

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
      // A failed interlock should not be recorded as an unhandled rejection.
      // It will bubble up to the HandledPromise itself.
      interlockP.catch(_ => {});

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
        promiseToPresence.set(handledP, resolvedPresence);
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
        let presence;
        try {
          presence = HandledPromise.unwrap(target);
        } catch (e) {
          presence = await target;
        }
        const existingPresenceHandler = presenceToHandler.get(presence);
        if (existingPresenceHandler) {
          promiseToHandler.set(handledP, existingPresenceHandler);
          promiseToPresence.set(handledP, presence);
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
    return handledP;
  }

  HandledPromise.prototype = promiseProto;
  Object.setPrototypeOf(HandledPromise, Promise);

  function isFrozenPromiseThen(p) {
    return (
      isFrozen(p) &&
      getPrototypeOf(p) === promiseProto &&
      promiseResolve(p) === p &&
      gopd(p, 'then') === undefined &&
      gopd(promiseProto, 'then').value === originalThen // unnecessary under SES
    );
  }

  const staticMethods = harden({
    get(target, key) {
      return handle(target, 'get', key);
    },
    getSendOnly(target, key) {
      handle(target, 'get', key);
    },
    applyFunction(target, args) {
      return handle(target, 'applyMethod', undefined, args);
    },
    applyFunctionSendOnly(target, args) {
      handle(target, 'applyMethod', undefined, args);
    },
    applyMethod(target, key, args) {
      return handle(target, 'applyMethod', key, args);
    },
    applyMethodSendOnly(target, key, args) {
      handle(target, 'applyMethod', key, args);
    },
    resolve(value) {
      ensureMaps();
      // Resolving a Presence returns the pre-registered handled promise.
      let resolvedPromise = presenceToPromise.get(value);
      if (!resolvedPromise) {
        resolvedPromise = promiseResolve(value);
      }
      // Prevent any proxy trickery.
      harden(resolvedPromise);
      if (isFrozenPromiseThen(resolvedPromise)) {
        return resolvedPromise;
      }
      // Assimilate the thenable.
      const executeThen = (resolve, reject) =>
        resolvedPromise.then(resolve, reject);
      return harden(
        promiseResolve().then(_ => new HandledPromise(executeThen)),
      );
    },
    // TODO verify that this is safe to provide universally, i.e.,
    // that by itself it doesn't provide access to mutable state in
    // ways that violate normal ocap module purity rules. The claim
    // that it does not rests on the handled promise itself being
    // necessary to perceive this mutable state. In that sense, we
    // can think of the right to perceive it, and of access to the
    // target, as being in the handled promise. Note that a .then on
    // the handled promise will already provide async access to the
    // target, so the only additional authorities are: 1)
    // synchronous access for handled promises only, and thus 2) the
    // ability to tell, from the client side, whether a promise is
    // handled. Or, at least, the ability to tell given that the
    // promise is already fulfilled.
    unwrap(value) {
      // This check for Thenable is safe, since in a remote-object
      // environment, our comms system will defend against remote
      // objects being represented as a tricky local Proxy, otherwise
      // it is guaranteed to be local and therefore synchronous enough.
      if (Object(value) !== value || !('then' in value)) {
        // Not a Thenable, so return it.
        // This means that local objects will pass through without error.
        return value;
      }

      // Try to look up the HandledPromise.
      ensureMaps();
      const pr = presenceToPromise.get(value) || value;

      // Find the fulfilled presence for that HandledPromise.
      const presence = promiseToPresence.get(pr);
      if (!presence) {
        throw TypeError(
          `Value is a Thenble but not a HandledPromise fulfilled to a presence`,
        );
      }
      return presence;
    },
  });

  defineProperties(HandledPromise, getOwnPropertyDescriptors(staticMethods));

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

  promiseResolve = Promise.resolve.bind(Promise);
  return harden(HandledPromise);
}
