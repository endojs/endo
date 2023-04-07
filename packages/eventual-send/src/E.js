import { trackTurns } from './track-turns.js';

const { details: X, quote: q, Fail } = assert;
const { assign, create } = Object;

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
const makeEProxyHandler = (x, HandledPromise) =>
  harden({
    ...baseFreezableProxyHandler,
    get: (_target, p, receiver) => {
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
    apply: (_target, _thisArg, argArray = []) => {
      return HandledPromise.applyFunction(x, argArray);
    },
    has: (_target, _p) => {
      // We just pretend everything exists.
      return true;
    },
  });

/**
 * A Proxy handler for E.sendOnly(x)
 * It is a variant on the E(x) Proxy handler.
 *
 * @param {*} x Any value passed to E.sendOnly(x)
 * @param {import('./index').HandledPromiseConstructor} HandledPromise
 * @returns {ProxyHandler} the Proxy handler
 */
const makeESendOnlyProxyHandler = (x, HandledPromise) =>
  harden({
    ...baseFreezableProxyHandler,
    get: (_target, p, receiver) => {
      return harden(
        {
          // This function purposely checks the `this` value (see above)
          // In order to be `this` sensitive it is defined using concise method
          // syntax rather than as an arrow function. To ensure the function
          // is not constructable, it also avoids the `function` syntax.
          [p](...args) {
            // Throw since the function returns nothing
            this === receiver ||
              Fail`Unexpected receiver for "${q(p)}" method of E.sendOnly(${q(
                x,
              )})`;
            HandledPromise.applyMethodSendOnly(x, p, args);
            return undefined;
          },
          // @ts-expect-error https://github.com/microsoft/TypeScript/issues/50319
        }[p],
      );
    },
    apply: (_target, _thisArg, argsArray = []) => {
      HandledPromise.applyFunctionSendOnly(x, argsArray);
      return undefined;
    },
    has: (_target, _p) => {
      // We just pretend that everything exists.
      return true;
    },
  });

/**
 * A Proxy handler for E.get(x)
 * It is a variant on the E(x) Proxy handler.
 *
 * @param {*} x Any value passed to E.get(x)
 * @param {import('./index').HandledPromiseConstructor} HandledPromise
 * @returns {ProxyHandler} the Proxy handler
 */
const makeEGetProxyHandler = (x, HandledPromise) =>
  harden({
    ...baseFreezableProxyHandler,
    has: (_target, _prop) => true,
    get: (_target, prop) => HandledPromise.get(x, prop),
  });

/**
 * @param {import('./index').HandledPromiseConstructor} HandledPromise
 */
const makeE = HandledPromise => {
  return harden(
    assign(
      /**
       * E(x) returns a proxy on which you can call arbitrary methods. Each of these
       * method calls returns a promise. The method will be invoked on whatever
       * 'x' designates (or resolves to) in a future turn, not this one.
       *
       * @template T
       * @param {T} x target for method/function call
       * @returns {import('./index').ECallableOrMethods<import('./index').RemoteFunctions<T>>} method/function call proxy
       */
      x => harden(new Proxy(() => {}, makeEProxyHandler(x, HandledPromise))),
      {
        /**
         * E.get(x) returns a proxy on which you can get arbitrary properties.
         * Each of these properties returns a promise for the property.  The promise
         * value will be the property fetched from whatever 'x' designates (or
         * resolves to) in a future turn, not this one.
         *
         * @template T
         * @param {T} x target for property get
         * @returns {import('./index').EGetters<import('./index').LocalRecord<T>>} property get proxy
         * @readonly
         */
        get: x =>
          harden(
            new Proxy(create(null), makeEGetProxyHandler(x, HandledPromise)),
          ),

        /**
         * E.resolve(x) converts x to a handled promise. It is
         * shorthand for HandledPromise.resolve(x)
         *
         * @template T
         * @param {T} x value to convert to a handled promise
         * @returns {Promise<Awaited<T>>} handled promise for x
         * @readonly
         */
        resolve: HandledPromise.resolve,

        /**
         * E.sendOnly returns a proxy similar to E, but for which the results
         * are ignored (undefined is returned).
         *
         * @template T
         * @param {T} x target for method/function call
         * @returns {import('./index').ESendOnlyCallableOrMethods<import('./index').RemoteFunctions<T>>} method/function call proxy
         * @readonly
         */
        sendOnly: x =>
          harden(
            new Proxy(() => {}, makeESendOnlyProxyHandler(x, HandledPromise)),
          ),

        /**
         * E.when(x, res, rej) is equivalent to
         * HandledPromise.resolve(x).then(res, rej)
         *
         * @template T
         * @template [U = T]
         * @param {T|PromiseLike<T>} x value to convert to a handled promise
         * @param {(value: T) => import('./index').ERef<U>} [onfulfilled]
         * @param {(reason: any) => import('./index').ERef<U>} [onrejected]
         * @returns {Promise<U>}
         * @readonly
         */
        when: (x, onfulfilled, onrejected) =>
          HandledPromise.resolve(x).then(
            ...trackTurns([onfulfilled, onrejected]),
          ),
      },
    ),
  );
};

export default makeE;

/**
 * Nominal type to carry the local and remote interfaces of a Remotable.
 *
 * @template Local The local properties of the object.
 * @template Remote The type of all the remotely-callable functions.
 * @typedef {{ constructor?: new (...args: RemotableBrand<Local, Remote>[]) => RemotableBrand<Local, Remote> }} RemotableBrand
 */

/**
 * Creates a type that accepts both near and marshalled references that were
 * returned from `Remotable` or `Far`, and also promises for such references.
 *
 * @template Primary The type of the primary reference.
 * @template [Local=DataOnly<Primary>] The local properties of the object.
 * @typedef {import('./index').ERef<Local & import('./E').RemotableBrand<Local, Primary>>} FarRef
 */

/**
 * `DataOnly<T>` means to return a record type `T2` consisting only of
 * properties that are *not* functions.
 *
 * @template T The type to be filtered.
 * @typedef {Omit<T, import('./index').FilteredKeys<T, import('./index').Callable>>} DataOnly
 */

/**
 * @typedef {ReturnType<makeE>} EProxy
 */
