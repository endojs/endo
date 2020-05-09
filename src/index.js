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
  let promiseToUnsettledHandler;
  let promiseToPresence; // only for HandledPromise.unwrap
  let forwardedPromiseToPromise; // forwarding, union-find-ish
  function ensureMaps() {
    if (!presenceToHandler) {
      presenceToHandler = new WeakMap();
      presenceToPromise = new WeakMap();
      promiseToUnsettledHandler = new WeakMap();
      promiseToPresence = new WeakMap();
      forwardedPromiseToPromise = new WeakMap();
    }
  }

  /**
   * You can imagine a forest of trees in which the roots of each tree is an
   * unresolved HandledPromise or a non-Promise, and each node's parent is the
   * HandledPromise to which it was forwarded.  We maintain that mapping of
   * forwarded HandledPromise to its resolution in forwardedPromiseToPromise.
   *
   * We use something like the description of "Find" with "Path splitting"
   * to propagate changes down to the children efficiently:
   * https://en.wikipedia.org/wiki/Disjoint-set_data_structure
   *
   * @param {*} target Any value.
   * @returns {*} If the target was a HandledPromise, the most-resolved parent of it, otherwise the target.
   */
  function shorten(target) {
    let p = target;
    // Find the most-resolved value for p.
    while (forwardedPromiseToPromise.has(p)) {
      p = forwardedPromiseToPromise.get(p);
    }
    const presence = promiseToPresence.get(p);
    if (presence) {
      // Presences are final, so it is ok to propagate
      // this upstream.
      while (target !== p) {
        const parent = forwardedPromiseToPromise.get(target);
        forwardedPromiseToPromise.delete(target);
        promiseToUnsettledHandler.delete(target);
        promiseToPresence.set(target, presence);
        target = parent;
      }
    } else {
      // We propagate p and remove all other unsettled handlers
      // upstream.
      // Note that everything except presences is covered here.
      while (target !== p) {
        const parent = forwardedPromiseToPromise.get(target);
        forwardedPromiseToPromise.set(target, p);
        promiseToUnsettledHandler.delete(target);
        target = parent;
      }
    }
    return target;
  }

  // This special handler accepts Promises, and forwards
  // handled Promises to their corresponding fulfilledHandler.
  let forwardingHandler;
  let handle;
  let promiseResolve;

  function HandledPromise(executor, unsettledHandler = undefined) {
    if (new.target === undefined) {
      throw new Error('must be invoked with "new"');
    }
    let handledResolve;
    let handledReject;
    let resolved = false;
    let resolvedTarget = null;
    let handledP;
    let continueForwarding = () => {};
    const superExecutor = (superResolve, superReject) => {
      handledResolve = value => {
        if (resolved) {
          return resolvedTarget;
        }
        if (forwardedPromiseToPromise.has(handledP)) {
          throw new TypeError('internal: already forwarded');
        }
        value = shorten(value);
        let targetP;
        if (
          promiseToUnsettledHandler.has(value) ||
          promiseToPresence.has(value)
        ) {
          targetP = value;
        } else {
          // We're resolving to a non-promise, so remove our handler.
          promiseToUnsettledHandler.delete(handledP);
          targetP = presenceToPromise.get(value);
        }
        // Ensure our data structure is a propert tree (avoid cycles).
        if (targetP && targetP !== handledP) {
          forwardedPromiseToPromise.set(handledP, targetP);
        } else {
          forwardedPromiseToPromise.delete(handledP);
        }

        // Remove stale unsettled handlers, set to canonical form.
        shorten(handledP);

        // Ensure our unsettledHandler is cleaned up if not already.
        if (promiseToUnsettledHandler.has(handledP)) {
          handledP.then(_ => promiseToUnsettledHandler.delete(handledP));
        }

        // Finish the resolution.
        superResolve(value);
        resolved = true;
        resolvedTarget = value;

        // We're resolved, so forward any postponed operations to us.
        continueForwarding();
        return resolvedTarget;
      };
      handledReject = err => {
        if (resolved) {
          return;
        }
        if (forwardedPromiseToPromise.has(handledP)) {
          throw new TypeError('internal: already forwarded');
        }
        promiseToUnsettledHandler.delete(handledP);
        resolved = true;
        superReject(err);
        continueForwarding();
      };
    };
    handledP = harden(Reflect.construct(Promise, [superExecutor], new.target));

    ensureMaps();

    const makePostponedHandler = () => {
      // Create a simple postponedHandler that just postpones until the
      // fulfilledHandler is set.
      let donePostponing;
      const interlockP = new Promise(resolve => {
        donePostponing = () => resolve();
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

      const postponedHandler = {
        get: makePostponedOperation('get'),
        applyMethod: makePostponedOperation('applyMethod'),
      };
      return [postponedHandler, donePostponing];
    };

    if (!unsettledHandler) {
      // This is insufficient for actual remote handled Promises
      // (too many round-trips), but is an easy way to create a
      // local handled Promise.
      [unsettledHandler, continueForwarding] = makePostponedHandler();
    }

    const validateHandler = h => {
      if (Object(h) !== h) {
        throw TypeError(`Handler ${h} cannot be a primitive`);
      }
    };
    validateHandler(unsettledHandler);

    // Until the handled promise is resolved, we use the unsettledHandler.
    promiseToUnsettledHandler.set(handledP, unsettledHandler);

    const rejectHandled = reason => {
      if (resolved) {
        return;
      }
      if (forwardedPromiseToPromise.has(handledP)) {
        throw new TypeError('internal: already forwarded');
      }
      handledReject(reason);
    };

    const resolveWithPresence = presenceHandler => {
      if (resolved) {
        return resolvedTarget;
      }
      if (forwardedPromiseToPromise.has(handledP)) {
        throw new TypeError('internal: already forwarded');
      }
      try {
        // Sanity checks.
        validateHandler(presenceHandler);

        // Validate and install our mapped target (i.e. presence).
        resolvedTarget = Object.create(null);

        // Create table entries for the presence mapped to the
        // fulfilledHandler.
        presenceToPromise.set(resolvedTarget, handledP);
        promiseToPresence.set(handledP, resolvedTarget);
        presenceToHandler.set(resolvedTarget, presenceHandler);

        // We committed to this presence, so resolve.
        handledResolve(resolvedTarget);
        return resolvedTarget;
      } catch (e) {
        handledReject(e);
        throw e;
      }
    };

    const resolveHandled = async (target, deprecatedPresenceHandler) => {
      if (resolved) {
        return;
      }
      if (forwardedPromiseToPromise.has(handledP)) {
        throw new TypeError('internal: already forwarded');
      }
      try {
        if (deprecatedPresenceHandler) {
          throw TypeError(
            `resolveHandled no longer accepts a handler; use resolveWithPresence`,
          );
        }

        // Resolve the target.
        handledResolve(target);
      } catch (e) {
        handledReject(e);
      }
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

  handle = (p, operation, ...opArgs) => {
    ensureMaps();
    const returnedP = new HandledPromise((resolve, reject) => {
      // We run in a future turn to prevent synchronous attacks,
      let raceIsOver = false;
      function win(handlerName, handler, o) {
        if (raceIsOver) {
          return;
        }
        if (typeof handler[operation] !== 'function') {
          throw TypeError(`${handlerName}.${operation} is not a function`);
        }
        // If we throw, the race is not over.
        resolve(handler[operation](o, ...opArgs, returnedP));
        raceIsOver = true;
      }

      function lose(e) {
        if (raceIsOver) {
          return;
        }
        reject(e);
        raceIsOver = true;
      }

      // This contestant tries to win with the target's resolution.
      HandledPromise.resolve(p)
        .then(o => win('forwardingHandler', forwardingHandler, o))
        .catch(lose);

      // This contestant sleeps a turn, but then tries to win immediately.
      HandledPromise.resolve()
        .then(() => {
          p = shorten(p);
          const unsettledHandler = promiseToUnsettledHandler.get(p);
          if (
            unsettledHandler &&
            typeof unsettledHandler[operation] === 'function'
          ) {
            // and resolve to the answer from the specific unsettled handler,
            // opArgs are something like [prop] or [method, args],
            // so we don't risk the user's args leaking into this expansion.
            // eslint-disable-next-line no-use-before-define
            win('unsettledHandler', unsettledHandler, p);
          } else if (Object(p) !== p || !('then' in p)) {
            // Not a Thenable, so use it.
            win('forwardingHandler', forwardingHandler, p);
          } else if (promiseToPresence.has(p)) {
            // We have the object synchronously, so resolve with it.
            const o = promiseToPresence.get(p);
            win('forwardingHandler', forwardingHandler, o);
          }
          // If we made it here without winning, then we will wait
          // for the other contestant to win instead.
        })
        .catch(lose);
    });

    // We return a handled promise with the default unsettled handler.
    // This prevents a race between the above Promise.resolves and
    // pipelining.
    return returnedP;
  };

  promiseResolve = Promise.resolve.bind(Promise);
  return harden(HandledPromise);
}
