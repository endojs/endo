/// <reference types="ses" />
import { trackTurns } from './track-turns.js';
import {
  localApplyFunction,
  localApplyMethod,
  localGet,
  sortedOwnKeys,
} from './local.js';
import { makePostponedHandler } from './postponed.js';

const { details: X, quote: q } = assert;

/**
 * @template T
 * @typedef {import('.').EHandler<T>} EHandler
 */

/** @typedef {import('.').HandledPromiseConstructor} HandledPromiseConstructor */

const {
  create,
  getOwnPropertyDescriptor,
  getOwnPropertyDescriptors,
  defineProperties,
  getPrototypeOf,
  setPrototypeOf,
  isFrozen,
  is: objectIs,
} = Object;

const { apply, construct } = Reflect;

const SEND_ONLY_RE = /^(.*)SendOnly$/;

/**
 * Coerce to an object property (string or symbol).
 *
 * @param {any} specimen
 * @returns {string | symbol}
 */
const coerceToObjectProperty = specimen => {
  if (typeof specimen === 'symbol') {
    return specimen;
  }
  return String(specimen);
};

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
 * @returns {HandledPromiseConstructor} Handled promise
 */
export const makeHandledPromise = () => {
  const presenceToHandler = new WeakMap();
  /** @type {WeakMap<any, any>} */
  const presenceToPromise = new WeakMap();
  const promiseToPendingHandler = new WeakMap();
  const promiseToPresence = new WeakMap();
  const forwardedPromiseToPromise = new WeakMap(); // forwarding, union-find-ish

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
   * @returns {*} If the target was a HandledPromise, the most-resolved parent
   * of it, otherwise the target.
   */
  const shorten = target => {
    let p = target;
    // Find the most-resolved value for p.
    while (forwardedPromiseToPromise.has(p)) {
      p = forwardedPromiseToPromise.get(p);
    }
    const presence = promiseToPresence.get(p);
    if (presence) {
      // Presences are final, so it is ok to propagate
      // this upstream.
      while (!objectIs(target, p)) {
        const parent = forwardedPromiseToPromise.get(target);
        forwardedPromiseToPromise.delete(target);
        promiseToPendingHandler.delete(target);
        promiseToPresence.set(target, presence);
        target = parent;
      }
    } else {
      // We propagate p and remove all other pending handlers
      // upstream.
      // Note that everything except presences is covered here.
      while (!objectIs(target, p)) {
        const parent = forwardedPromiseToPromise.get(target);
        forwardedPromiseToPromise.set(target, p);
        promiseToPendingHandler.delete(target);
        target = parent;
      }
    }
    return target;
  };

  /**
   * This special handler accepts Promises, and forwards
   * handled Promises to their corresponding fulfilledHandler.
   *
   * @type {Required<EHandler<any>>}
   */
  let forwardingHandler;
  let handle;

  /**
   * @param {string} handlerName
   * @param {EHandler<any>} handler
   * @param {string} operation
   * @param {any} o
   * @param {any[]} opArgs
   * @param {Promise<unknown>} [returnedP]
   * @returns {any}
   */
  const dispatchToHandler = (
    handlerName,
    handler,
    operation,
    o,
    opArgs,
    returnedP,
  ) => {
    let actualOp = operation;

    const matchSendOnly = SEND_ONLY_RE.exec(actualOp);

    const makeResult = result => (matchSendOnly ? undefined : result);

    if (matchSendOnly) {
      // We don't specify the resulting promise if it is sendonly.
      returnedP = undefined;
    }

    if (matchSendOnly && typeof handler[actualOp] !== 'function') {
      // Substitute for sendonly with the corresponding non-sendonly operation.
      actualOp = matchSendOnly[1];
    }

    // Fast path: just call the actual operation.
    const hfn = handler[actualOp];
    if (typeof hfn === 'function') {
      const result = apply(hfn, handler, [o, ...opArgs, returnedP]);
      return makeResult(result);
    }

    if (actualOp === 'applyMethod') {
      // Compose a missing applyMethod by get followed by applyFunction.
      const [prop, args] = opArgs;
      const getResultP = handle(
        o,
        'get',
        // The argument to 'get' is a string or symbol.
        [coerceToObjectProperty(prop)],
        undefined,
      );
      return makeResult(handle(getResultP, 'applyFunction', [args], returnedP));
    }

    // BASE CASE: applyFunction bottoms out into applyMethod, if it exists.
    if (actualOp === 'applyFunction') {
      const amfn = handler.applyMethod;
      if (typeof amfn === 'function') {
        // Downlevel a missing applyFunction to applyMethod with undefined name.
        const [args] = opArgs;
        const result = apply(amfn, handler, [o, undefined, [args], returnedP]);
        return makeResult(result);
      }
    }

    assert.fail(
      X`${q(handlerName)} is defined but has no methods needed for ${q(
        operation,
      )} (has ${q(sortedOwnKeys(handler))})`,
      TypeError,
    );
  };

  /** @type {HandledPromiseConstructor} */
  let HandledPromise;

  /**
   * This *needs* to be a `function X` so that we can use it as a constructor.
   *
   * @template R
   * @param {import('.').HandledExecutor<R>} executor
   * @param {EHandler<Promise<R>>} [pendingHandler]
   * @returns {Promise<R>}
   */
  function baseHandledPromise(executor, pendingHandler = undefined) {
    assert(new.target, X`must be invoked with "new"`);
    let handledResolve;
    let handledReject;
    let resolved = false;
    let resolvedTarget = null;
    let handledP;
    let continueForwarding = () => {};
    const superExecutor = (superResolve, superReject) => {
      handledResolve = value => {
        if (resolved) {
          return;
        }
        assert(
          !forwardedPromiseToPromise.has(handledP),
          X`internal: already forwarded`,
          TypeError,
        );
        value = shorten(value);
        let targetP;
        if (
          promiseToPendingHandler.has(value) ||
          promiseToPresence.has(value)
        ) {
          targetP = value;
        } else {
          // We're resolving to a non-promise, so remove our handler.
          promiseToPendingHandler.delete(handledP);
          targetP = presenceToPromise.get(value);
        }
        // Ensure our data structure is a proper tree (avoid cycles).
        if (targetP && !objectIs(targetP, handledP)) {
          forwardedPromiseToPromise.set(handledP, targetP);
        } else {
          forwardedPromiseToPromise.delete(handledP);
        }

        // Remove stale pending handlers, set to canonical form.
        shorten(handledP);

        // Finish the resolution.
        superResolve(value);
        resolved = true;
        resolvedTarget = value;

        // We're resolved, so forward any postponed operations to us.
        continueForwarding();
      };
      handledReject = reason => {
        if (resolved) {
          return;
        }
        harden(reason);
        assert(
          !forwardedPromiseToPromise.has(handledP),
          X`internal: already forwarded`,
          TypeError,
        );
        promiseToPendingHandler.delete(handledP);
        resolved = true;
        superReject(reason);
        continueForwarding();
      };
    };
    handledP = harden(construct(Promise, [superExecutor], new.target));

    if (!pendingHandler) {
      // This is insufficient for actual remote handled Promises
      // (too many round-trips), but is an easy way to create a
      // local handled Promise.
      [pendingHandler, continueForwarding] = makePostponedHandler(
        HandledPromise,
      );
    }

    const validateHandler = h => {
      assert(Object(h) === h, X`Handler ${h} cannot be a primitive`, TypeError);
    };
    validateHandler(pendingHandler);

    // Until the handled promise is resolved, we use the pendingHandler.
    promiseToPendingHandler.set(handledP, pendingHandler);

    const rejectHandled = reason => {
      if (resolved) {
        return;
      }
      assert(
        !forwardedPromiseToPromise.has(handledP),
        X`internal: already forwarded`,
        TypeError,
      );
      handledReject(reason);
    };

    const resolveWithPresence = (presenceHandler, options = {}) => {
      if (resolved) {
        return resolvedTarget;
      }
      assert(
        !forwardedPromiseToPromise.has(handledP),
        X`internal: already forwarded`,
        TypeError,
      );
      try {
        // Sanity checks.
        validateHandler(presenceHandler);

        const { proxy: proxyOpts } = options;
        let presence;
        if (proxyOpts) {
          const {
            handler: proxyHandler,
            target: proxyTarget,
            revokerCallback,
          } = proxyOpts;
          if (revokerCallback) {
            // Create a proxy and its revoke function.
            const { proxy, revoke } = Proxy.revocable(
              proxyTarget,
              proxyHandler,
            );
            presence = proxy;
            revokerCallback(revoke);
          } else {
            presence = new Proxy(proxyTarget, proxyHandler);
          }
        } else {
          // Default presence.
          presence = create(null);
        }

        // Validate and install our mapped target (i.e. presence).
        resolvedTarget = presence;

        // Create table entries for the presence mapped to the
        // fulfilledHandler.
        presenceToPromise.set(resolvedTarget, handledP);
        promiseToPresence.set(handledP, resolvedTarget);
        presenceToHandler.set(resolvedTarget, presenceHandler);

        // We committed to this presence, so resolve.
        handledResolve(resolvedTarget);
        return resolvedTarget;
      } catch (e) {
        assert.note(e, X`during resolveWithPresence`);
        handledReject(e);
        throw e;
      }
    };

    const resolveHandled = target => {
      if (resolved) {
        return;
      }
      assert(
        !forwardedPromiseToPromise.has(handledP),
        X`internal: already forwarded`,
        TypeError,
      );
      try {
        // Resolve the target.
        handledResolve(target);
      } catch (e) {
        handledReject(e);
      }
    };

    // Invoke the callback to let the user resolve/reject.
    executor(resolveHandled, rejectHandled, resolveWithPresence);

    return handledP;
  }

  const isFrozenPromiseThen = p => {
    return (
      isFrozen(p) &&
      getPrototypeOf(p) === Promise.prototype &&
      Promise.resolve(p) === p &&
      getOwnPropertyDescriptor(p, 'then') === undefined
    );
  };

  /** @type {import('.').HandledPromiseStaticMethods & Pick<PromiseConstructor, 'resolve'>} */
  const staticMethods = {
    get(target, prop) {
      prop = coerceToObjectProperty(prop);
      return handle(target, 'get', [prop]);
    },
    getSendOnly(target, prop) {
      prop = coerceToObjectProperty(prop);
      handle(target, 'getSendOnly', [prop]).catch(() => {});
    },
    applyFunction(target, args) {
      // Ensure args is an array.
      args = [...args];
      return handle(target, 'applyFunction', [args]);
    },
    applyFunctionSendOnly(target, args) {
      // Ensure args is an array.
      args = [...args];
      handle(target, 'applyFunctionSendOnly', [args]).catch(() => {});
    },
    applyMethod(target, prop, args) {
      prop = coerceToObjectProperty(prop);
      // Ensure args is an array.
      args = [...args];
      return handle(target, 'applyMethod', [prop, args]);
    },
    applyMethodSendOnly(target, prop, args) {
      prop = coerceToObjectProperty(prop);
      // Ensure args is an array.
      args = [...args];
      handle(target, 'applyMethodSendOnly', [prop, args]).catch(() => {});
    },
    resolve(value) {
      // Resolving a Presence returns the pre-registered handled promise.
      let resolvedPromise = presenceToPromise.get(/** @type {any} */ (value));
      if (!resolvedPromise) {
        resolvedPromise = Promise.resolve(value);
      }
      // Prevent any proxy trickery.
      harden(resolvedPromise);
      if (isFrozenPromiseThen(resolvedPromise)) {
        // We can use the `resolvedPromise` directly, since it is guaranteed to
        // have a `then` which is actually `Promise.prototype.then`.
        return resolvedPromise;
      }
      // Assimilate the `resolvedPromise` as an actual frozen Promise, by
      // treating `resolvedPromise` as if it is a non-promise thenable.
      const executeThen = (resolve, reject) =>
        resolvedPromise.then(resolve, reject);
      return harden(
        Promise.resolve().then(() => new HandledPromise(executeThen)),
      );
    },
  };

  const makeForwarder = (operation, localImpl) => {
    return (o, ...args) => {
      // We are in another turn already, and have the naked object.
      const presenceHandler = presenceToHandler.get(o);
      if (!presenceHandler) {
        return localImpl(o, ...args);
      }
      return dispatchToHandler(
        'presenceHandler',
        presenceHandler,
        operation,
        o,
        args,
      );
    };
  };

  // eslint-disable-next-line prefer-const
  forwardingHandler = {
    get: makeForwarder('get', localGet),
    getSendOnly: makeForwarder('getSendOnly', localGet),
    applyFunction: makeForwarder('applyFunction', localApplyFunction),
    applyFunctionSendOnly: makeForwarder(
      'applyFunctionSendOnly',
      localApplyFunction,
    ),
    applyMethod: makeForwarder('applyMethod', localApplyMethod),
    applyMethodSendOnly: makeForwarder('applyMethodSendOnly', localApplyMethod),
  };

  handle = (...handleArgs) => {
    // We're in SES mode, so we should harden.
    harden(handleArgs);
    const [_p, operation, opArgs, ...dispatchArgs] = handleArgs;
    let [p] = handleArgs;
    const doDispatch = (handlerName, handler, o) =>
      dispatchToHandler(
        handlerName,
        handler,
        operation,
        o,
        opArgs,
        // eslint-disable-next-line no-use-before-define
        ...(dispatchArgs.length === 0 ? [returnedP] : dispatchArgs),
      );
    const [trackedDoDispatch] = trackTurns([doDispatch]);
    const returnedP = new HandledPromise((resolve, reject) => {
      // We run in a future turn to prevent synchronous attacks,
      let raceIsOver = false;

      const win = (handlerName, handler, o) => {
        if (raceIsOver) {
          return;
        }
        try {
          resolve(trackedDoDispatch(handlerName, handler, o));
        } catch (reason) {
          reject(harden(reason));
        }
        raceIsOver = true;
      };

      const lose = reason => {
        if (raceIsOver) {
          return;
        }
        reject(harden(reason));
        raceIsOver = true;
      };

      // This contestant tries to win with the target's resolution.
      staticMethods
        .resolve(p)
        .then(o => win('forwardingHandler', forwardingHandler, o))
        .catch(lose);

      // This contestant sleeps a turn, but then tries to win immediately.
      staticMethods
        .resolve()
        .then(() => {
          p = shorten(p);
          const pendingHandler = promiseToPendingHandler.get(p);
          if (pendingHandler) {
            // resolve to the answer from the specific pending handler,
            win('pendingHandler', pendingHandler, p);
          } else if (!p || typeof p.then !== 'function') {
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

    // We return a handled promise with the default pending handler.  This
    // prevents a race between the above Promise.resolves and pipelining.
    return harden(returnedP);
  };

  // Add everything needed on the constructor.
  baseHandledPromise.prototype = Promise.prototype;
  setPrototypeOf(baseHandledPromise, Promise);
  defineProperties(
    baseHandledPromise,
    getOwnPropertyDescriptors(staticMethods),
  );

  // FIXME: This is really ugly to bypass the type system, but it will be better
  // once we use Promise.delegated and don't have any [[Constructor]] behaviours.
  /** @type {unknown} */
  const unknownBaseHandledPromise = baseHandledPromise;
  HandledPromise = /** @type {typeof HandledPromise} */ (unknownBaseHandledPromise);

  // We cannot harden(HandledPromise) because we're a vetted shim which
  // runs before lockdown() allows harden to function.  In that case,
  // though, globalThis.HandledPromise will be hardened after lockdown.
  return HandledPromise;
};
