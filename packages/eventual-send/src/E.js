import { trackTurns } from './track-turns.js';

const { details: X, quote: q } = assert;

/** @type {ProxyHandler<any>} */
const baseFreezableProxyHandler = {
  set(_target, _prop, _value) {
    return false;
  },
  isExtensible(_target) {
    return false;
  },
  setPrototypeOf(_target, _value) {
    return false;
  },
  deleteProperty(_target, _prop) {
    return false;
  },
};

// E Proxy handlers pretend that any property exists on the target and returns
// a function for their value. While this function is "bound" by context, it is
// meant to be called as a method. For that reason, the returned function
// includes a check that the `this` argument corresponds to the initial
// receiver when the function was retrieved.
// E Proxy handlers also forward direct calls to the target in case the remote
// is a function instead of an object. No such receiver checks are necessary in
// that case.

/**
 * A Proxy handler for E(x).
 *
 * @param {*} x Any value passed to E(x)
 * @param {import('./index').HandledPromiseConstructor} HandledPromise
 * @returns {ProxyHandler} the Proxy handler
 */
function EProxyHandler(x, HandledPromise) {
  return harden({
    ...baseFreezableProxyHandler,
    get(_target, p, receiver) {
      return harden(
        {
          // This function purposely checks the `this` value (see above)
          // In order to be `this` sensitive it is defined using concise method
          // syntax rather than as an arrow function. To ensure the function
          // is not constructable, it also avoids the `function` syntax.
          [p](...args) {
            if (this !== receiver) {
              // Reject the async function call
              return HandledPromise.reject(
                assert.error(
                  X`Unexpected receiver for "${p}" method of E(${q(x)})`,
                ),
              );
            }

            return HandledPromise.applyMethod(x, p, args);
          },
          // @ts-expect-error https://github.com/microsoft/TypeScript/issues/50319
        }[p],
      );
    },
    apply(_target, _thisArg, argArray = []) {
      return HandledPromise.applyFunction(x, argArray);
    },
    has(_target, _p) {
      // We just pretend everything exists.
      return true;
    },
  });
}

/**
 * A Proxy handler for E.sendOnly(x)
 * It is a variant on the E(x) Proxy handler.
 *
 * @param {*} x Any value passed to E.sendOnly(x)
 * @param {import('./index').HandledPromiseConstructor} HandledPromise
 * @returns {ProxyHandler} the Proxy handler
 */
function EsendOnlyProxyHandler(x, HandledPromise) {
  return harden({
    ...baseFreezableProxyHandler,
    get(_target, p, receiver) {
      return harden(
        {
          // This function purposely checks the `this` value (see above)
          // In order to be `this` sensitive it is defined using concise method
          // syntax rather than as an arrow function. To ensure the function
          // is not constructable, it also avoids the `function` syntax.
          [p](...args) {
            // Throw since the function returns nothing
            assert.equal(
              this,
              receiver,
              X`Unexpected receiver for "${p}" method of E.sendOnly(${q(x)})`,
            );
            HandledPromise.applyMethodSendOnly(x, p, args);
            return undefined;
          },
          // @ts-expect-error https://github.com/microsoft/TypeScript/issues/50319
        }[p],
      );
    },
    apply(_target, _thisArg, argsArray = []) {
      HandledPromise.applyFunctionSendOnly(x, argsArray);
      return undefined;
    },
    has(_target, _p) {
      // We just pretend that everything exists.
      return true;
    },
  });
}

/**
 * @param {import('./index').HandledPromiseConstructor} HandledPromise
 * @returns {import('./index').EProxy}
 */
export default function makeE(HandledPromise) {
  function E(x) {
    const handler = EProxyHandler(x, HandledPromise);
    return harden(new Proxy(() => {}, handler));
  }

  const makeEGetterProxy = x =>
    new Proxy(Object.create(null), {
      ...baseFreezableProxyHandler,
      has(_target, _prop) {
        return true;
      },
      get(_target, prop) {
        return HandledPromise.get(x, prop);
      },
    });

  E.get = makeEGetterProxy;
  E.resolve = HandledPromise.resolve;
  E.sendOnly = x => {
    const handler = EsendOnlyProxyHandler(x, HandledPromise);
    return harden(new Proxy(() => {}, handler));
  };

  E.when = (x, onfulfilled, onrejected) => {
    const [onsuccess, onfailure] = trackTurns([onfulfilled, onrejected]);
    return HandledPromise.resolve(x).then(onsuccess, onfailure);
  };

  return harden(E);
}
