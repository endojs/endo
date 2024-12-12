import { trackTurns } from './track-turns.js';
import { makeMessageBreakpointTester } from './message-breakpoints.js';

const { details: X, quote: q, Fail, error: makeError } = assert;
const { assign, create } = Object;

/**
 * @import { HandledPromiseConstructor } from './types.js';
 */

const onSend = makeMessageBreakpointTester('ENDO_SEND_BREAKPOINTS');

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
 * @param {any} recipient Any value passed to E(x)
 * @param {HandledPromiseConstructor} HandledPromise
 * @returns {ProxyHandler<unknown>} the Proxy handler
 */
const makeEProxyHandler = (recipient, HandledPromise) =>
  harden({
    ...baseFreezableProxyHandler,
    get: (_target, propertyKey, receiver) => {
      return harden(
        {
          // This function purposely checks the `this` value (see above)
          // In order to be `this` sensitive it is defined using concise method
          // syntax rather than as an arrow function. To ensure the function
          // is not constructable, it also avoids the `function` syntax.
          /** @type {(...args: any[]) => Promise<unknown>} */
          [propertyKey](...args) {
            if (this !== receiver) {
              // Reject the async function call
              return HandledPromise.reject(
                makeError(
                  X`Unexpected receiver for "${q(propertyKey)}" method of E(${q(
                    recipient,
                  )})`,
                ),
              );
            }

            if (onSend && onSend.shouldBreakpoint(recipient, propertyKey)) {
              // eslint-disable-next-line no-debugger
              debugger; // LOOK UP THE STACK
              // Stopped at a breakpoint on eventual-send of a method-call
              // message,
              // so that you can walk back on the stack to see how we came to
              // make this eventual-send
            }
            return HandledPromise.applyMethod(recipient, propertyKey, args);
          },
          // @ts-expect-error https://github.com/microsoft/TypeScript/issues/50319
        }[propertyKey],
      );
    },
    apply: (_target, _thisArg, argArray = []) => {
      if (onSend && onSend.shouldBreakpoint(recipient, undefined)) {
        // eslint-disable-next-line no-debugger
        debugger; // LOOK UP THE STACK
        // Stopped at a breakpoint on eventual-send of a function-call message,
        // so that you can walk back on the stack to see how we came to
        // make this eventual-send
      }
      return HandledPromise.applyFunction(recipient, argArray);
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
 * @param {any} recipient Any value passed to E.sendOnly(x)
 * @param {HandledPromiseConstructor} HandledPromise
 * @returns {ProxyHandler<unknown>} the Proxy handler
 */
const makeESendOnlyProxyHandler = (recipient, HandledPromise) =>
  harden({
    ...baseFreezableProxyHandler,
    get: (_target, propertyKey, receiver) => {
      return harden(
        {
          // This function purposely checks the `this` value (see above)
          // In order to be `this` sensitive it is defined using concise method
          // syntax rather than as an arrow function. To ensure the function
          // is not constructable, it also avoids the `function` syntax.
          /** @type {(...args: any[]) => undefined} */
          [propertyKey](...args) {
            // Throw since the function returns nothing
            this === receiver ||
              Fail`Unexpected receiver for "${q(
                propertyKey,
              )}" method of E.sendOnly(${q(recipient)})`;
            if (onSend && onSend.shouldBreakpoint(recipient, propertyKey)) {
              // eslint-disable-next-line no-debugger
              debugger; // LOOK UP THE STACK
              // Stopped at a breakpoint on eventual-send of a method-call
              // message,
              // so that you can walk back on the stack to see how we came to
              // make this eventual-send
            }
            HandledPromise.applyMethodSendOnly(recipient, propertyKey, args);
            return undefined;
          },
          // @ts-expect-error https://github.com/microsoft/TypeScript/issues/50319
        }[propertyKey],
      );
    },
    apply: (_target, _thisArg, argsArray = []) => {
      if (onSend && onSend.shouldBreakpoint(recipient, undefined)) {
        // eslint-disable-next-line no-debugger
        debugger; // LOOK UP THE STACK
        // Stopped at a breakpoint on eventual-send of a function-call message,
        // so that you can walk back on the stack to see how we came to
        // make this eventual-send
      }
      HandledPromise.applyFunctionSendOnly(recipient, argsArray);
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
 * @param {any} x Any value passed to E.get(x)
 * @param {HandledPromiseConstructor} HandledPromise
 * @returns {ProxyHandler<unknown>} the Proxy handler
 */
const makeEGetProxyHandler = (x, HandledPromise) =>
  harden({
    ...baseFreezableProxyHandler,
    has: (_target, _prop) => true,
    get: (_target, prop) => HandledPromise.get(x, prop),
  });

/**
 * @param {HandledPromiseConstructor} HandledPromise
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
       * @returns {ECallableOrMethods<RemoteFunctions<T>>} method/function call proxy
       */
      // @ts-expect-error XXX typedef
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
         * @returns {EGetters<LocalRecord<T>>} property get proxy
         * @readonly
         */
        get: x =>
          // @ts-expect-error XXX typedef
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
         * @returns {ESendOnlyCallableOrMethods<RemoteFunctions<T>>} method/function call proxy
         * @readonly
         */
        sendOnly: x =>
          // @ts-expect-error XXX typedef
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
         * @param {(value: T) => ERef<U>} [onfulfilled]
         * @param {(reason: any) => ERef<U>} [onrejected]
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

/** @typedef {ReturnType<makeE>} EProxy */

/**
 * Declare an object that is potentially a far reference of type Primary whose
 * auxilliary data has type Local.  This should be used only for consumers of
 * Far objects in arguments and declarations; the only creators of Far objects
 * are distributed object creator components like the `Far` or `Remotable`
 * functions.
 *
 * @template Primary The type of the primary reference.
 * @template [Local=DataOnly<Primary>] The local properties of the object.
 * @typedef {ERef<Local & import('./types.js').RemotableBrand<Local, Primary>>} FarRef
 */

/**
 * `DataOnly<T>` means to return a record type `T2` consisting only of
 * properties that are *not* functions.
 *
 * @template T The type to be filtered.
 * @typedef {Omit<T, FilteredKeys<T, import('./types.js').Callable>>} DataOnly
 */

/**
 * @see {@link https://github.com/microsoft/TypeScript/issues/31394}
 * @template T
 * @typedef {PromiseLike<T> | T} ERef
 * Declare that `T` may or may not be a Promise.  This should be used only for
 * consumers of arguments and declarations; return values should specifically be
 * `Promise<T>` or `T` itself.
 */

/**
 * The awaited return type of a function.
 *
 * @template {(...args: any[]) => any} T
 * @typedef {T extends (...args: any[]) => infer R ? Awaited<R> : never} EReturn
 */

/**
 * @template {import('./types.js').Callable} T
 * @typedef {(
 *   ReturnType<T> extends PromiseLike<infer U>                       // if function returns a promise
 *     ? T                                                            // return the function
 *     : (...args: Parameters<T>) => Promise<EReturn<T>>  // make it return a promise
 * )} ECallable
 */

/**
 * @template T
 * @typedef {{
 *   readonly [P in keyof T]: T[P] extends import('./types.js').Callable
 *     ? ECallable<T[P]>
 *     : never;
 * }} EMethods
 */

/**
 * @template T
 * @typedef {{
 *   readonly [P in keyof T]: T[P] extends PromiseLike<infer U>
 *     ? T[P]
 *     : Promise<Awaited<T[P]>>;
 * }} EGetters
 */

/**
 * @template {import('./types.js').Callable} T
 * @typedef {(...args: Parameters<T>) => Promise<void>} ESendOnlyCallable
 */

/**
 * @template T
 * @typedef {{
 *   readonly [P in keyof T]: T[P] extends import('./types.js').Callable
 *     ? ESendOnlyCallable<T[P]>
 *     : never;
 * }} ESendOnlyMethods
 */

/**
 * @template T
 * @typedef {(
 *   T extends import('./types.js').Callable
 *     ? ESendOnlyCallable<T> & ESendOnlyMethods<Required<T>>
 *     : ESendOnlyMethods<Required<T>>
 * )} ESendOnlyCallableOrMethods
 */

/**
 * @template T
 * @typedef {(
 *   T extends import('./types.js').Callable
 *     ? ECallable<T> & EMethods<Required<T>>
 *     : EMethods<Required<T>>
 * )} ECallableOrMethods
 */

/**
 * Return a union of property names/symbols/numbers P for which the record element T[P]'s type extends U.
 *
 * Given const x = { a: 123, b: 'hello', c: 42, 49: () => {}, 53: 67 },
 *
 * FilteredKeys<typeof x, number> is the type 'a' | 'c' | 53.
 * FilteredKeys<typeof x, string> is the type 'b'.
 * FilteredKeys<typeof x, 42 | 67> is the type 'c' | 53.
 * FilteredKeys<typeof x, boolean> is the type never.
 *
 * @template T
 * @template U
 * @typedef {{ [P in keyof T]: T[P] extends U ? P : never; }[keyof T]} FilteredKeys
 */

/**
 * `PickCallable<T>` means to return a single root callable or a record type
 * consisting only of properties that are functions.
 *
 * @template T
 * @typedef {(
 *   T extends import('./types.js').Callable
 *     ? (...args: Parameters<T>) => ReturnType<T>                     // a root callable, no methods
 *     : Pick<T, FilteredKeys<T, import('./types.js').Callable>>          // any callable methods
 * )} PickCallable
 */

/**
 * `RemoteFunctions<T>` means to return the functions and properties that are remotely callable.
 *
 * @template T
 * @typedef {(
 *   T extends import('./types.js').RemotableBrand<infer L, infer R>     // if a given T is some remote interface R
 *     ? PickCallable<R>                                              // then return the callable properties of R
 *     : Awaited<T> extends import('./types.js').RemotableBrand<infer L, infer R> // otherwise, if the final resolution of T is some remote interface R
 *     ? PickCallable<R>                                              // then return the callable properties of R
 *     : T extends PromiseLike<infer U>                               // otherwise, if T is a promise
 *     ? Awaited<T>                                                   // then return resolved value T
 *     : T                                                            // otherwise, return T
 * )} RemoteFunctions
 */

/**
 * @template T
 * @typedef {(
 *   T extends import('./types.js').RemotableBrand<infer L, infer R>
 *     ? L
 *     : Awaited<T> extends import('./types.js').RemotableBrand<infer L, infer R>
 *     ? L
 *     : T extends PromiseLike<infer U>
 *     ? Awaited<T>
 *     : T
 * )} LocalRecord
 */

/**
 * @template [R = unknown]
 * @typedef {{
 *   promise: Promise<R>;
 *   settler: import('./types.js').Settler<R>;
 * }} EPromiseKit
 */

/**
 * Declare a near object that must only be invoked with E, even locally.  It
 * supports the `T` interface but additionally permits `T`'s methods to return
 * `PromiseLike`s even if `T` declares them as only synchronous.
 *
 * @template T
 * @typedef {(
 *   T extends import('./types.js').Callable
 *     ? (...args: Parameters<T>) => ERef<Awaited<EOnly<ReturnType<T>>>>
 *     : T extends Record<PropertyKey, import('./types.js').Callable>
 *     ? {
 *         [K in keyof T]: T[K] extends import('./types.js').Callable
 *           ? (...args: Parameters<T[K]>) => ERef<Awaited<EOnly<ReturnType<T[K]>>>>
 *           : T[K];
 *       }
 *     : T
 * )} EOnly
 */
