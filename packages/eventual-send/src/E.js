// @ts-check
/**
 * @file provides a `makeE` that can be parameterized with an `unwrap` function
 * and corresponding `EUnwrap<T>`.  These will be used to
 * extract the final settlement from a chain of PromiseLikes and PromiseSteps or
 * similar non-thenable pseudo-promises.
 *
 * `@agoric/vow/vat.js` uses this mechanism to export a `V` function with
 * similar behaviour as the default `E`, augmented with automatic unwrapping of
 * recipient Vows as if they were PromiseLikes.
 */
import harden from '@endo/harden';
import { trackTurns } from './track-turns.js';
import { makeMessageBreakpointTester } from './message-breakpoints.js';

const { details: X, error: makeError } = assert;
const { assign, freeze } = Object;

/**
 * @import {
 *   EUnwrap, HandledPromiseConstructor,
 *   RemotableBrand, Callable, Settler
 * } from './types.js';
 */

const onSend = makeMessageBreakpointTester('ENDO_SEND_BREAKPOINTS');

export const AsyncControl = Symbol.for('E.Control');

// E Proxy handlers pretend that any property exists on the target and returns
// a function for their value. While this function is "bound" by context, it is
// meant to be called as a method. For that reason, the returned function
// includes a check that the `this` argument corresponds to the initial
// receiver when the function was retrieved.
// E Proxy handlers also forward direct calls to the target in case the remote
// is a function instead of an object. No such receiver checks are necessary in
// that case.

/**
 * `freeze` but not `harden` the proxy target so it remains trapping.
 *
 * @see https://github.com/endojs/endo/blob/master/packages/ses/docs/preparing-for-stabilize.md
 */
const defaultFinishTarget = freeze;

/**
 * @template {(...args: any[]) => any} T
 * @param {T} target
 * @returns {T}
 */
export const stripFunction = target => {
  Object.setPrototypeOf(target, {
    __proto__: null,
    [Symbol.toStringTag]: 'AsyncNode',
  });
  for (const key of Reflect.ownKeys(target)) {
    delete target[key];
  }
  return target;
};

/**
 *
 * @param {() => unknown} getThisArg
 * @param {Map<PropertyKey, Callable>} shadowMethods
 * @returns {unknown}
 */
const makeTarget = (getThisArg, shadowMethods) => {
  const target = stripFunction(() => {});
  for (const [key, fn] of shadowMethods.entries()) {
    Object.defineProperty(target, key, {
      enumerable: true,
      value: (...args) => Reflect.apply(fn, getThisArg(), args),
    });
  }
  return target;
};

/**
 * @template T
 * @template {boolean} [SendOnly=false]
 * @param {unknown} boundThis
 * @param {object} powers
 * @param {HandledPromiseConstructor} powers.HandledPromise
 * @param {<T>(x: T) => Promise<EUnwrap<T>>} powers.unwrap
 * @param {Map<PropertyKey, Callable>} powers.shadowMethods
 * @param {(tgt: any) => any} powers.finishTarget
 * @param {{ sendMode: 'default' | 'sendOnly' | 'blackhole', boundName?: PropertyKey, thisNode: AsyncNode<any, boolean> }} [opts]
 * @returns {AsyncNode<T, SendOnly> & { [AsyncControl]: AsyncControl<AsyncNode<T, SendOnly>> }}
 */
const makeAsyncNode = (boundThis, powers, opts) => {
  const { sendMode, thisNode, boundName } = opts || {};
  const { HandledPromise, finishTarget, shadowMethods, unwrap } = powers;

  /**
   * @template {string} M
   * @param {M} method
   * @returns {M | `${M}SendOnly` | null}
   */
  const maybeSO = method => {
    if (sendMode === 'blackhole') {
      return null;
    }
    if (sendMode === 'sendOnly') {
      return `${method}SendOnly`;
    }
    return method;
  };

  let cachedThisArg;
  const getThisArg = () => {
    if (cachedThisArg === undefined) {
      if (boundName === undefined) {
        cachedThisArg = unwrap(boundThis);
      } else {
        cachedThisArg = unwrap(HandledPromise.get(boundThis, boundName));
      }
    }
    return cachedThisArg;
  };

  const tgt = finishTarget(makeTarget(getThisArg, shadowMethods));

  const node = new Proxy(
    tgt,
    harden({
      apply(_target, thisArg, argArray = []) {
        if (thisArg !== undefined && thisArg !== thisNode) {
          return makeAsyncNode(
            HandledPromise.reject(
              makeError(X`Unexpected thisArg ${thisArg}`, TypeError),
            ),
            powers,
            opts,
          );
        }
        if (onSend && onSend.shouldBreakpoint(boundThis, boundName)) {
          // eslint-disable-next-line no-debugger
          debugger; // LOOK UP THE STACK
          // Stopped at a breakpoint on eventual-send of a function-call message,
          // so that you can walk back on the stack to see how we came to
          // make this eventual-send
        }

        if (sendMode === 'blackhole') {
          // Resolve immediately to a void promise, no operation.
          return makeAsyncNode(Promise.resolve(), powers, {
            sendMode,
            thisNode: node,
          });
        }

        let retP;
        if (boundName === undefined) {
          retP = HandledPromise[maybeSO('applyFunction')](
            getThisArg(),
            argArray,
          );
        } else {
          retP = HandledPromise[maybeSO('applyMethod')](
            boundThis,
            boundName,
            argArray,
          );
        }
        return makeAsyncNode(retP, powers, { sendMode, thisNode: node });
      },
      deleteProperty(target, propertyKey) {
        if (shadowMethods.has(propertyKey)) {
          return false;
        }
        if (!Reflect.deleteProperty(target, propertyKey)) {
          return false;
        }
        const method = maybeSO('deleteProperty');
        if (method !== null) {
          HandledPromise[method](getThisArg(), propertyKey);
        }
        return true;
      },
      get(target, propertyKey, receiver) {
        if (receiver !== target) {
          return makeAsyncNode(
            HandledPromise.reject(
              makeError(
                X`Unexpected receiver ${receiver} for get ${propertyKey}`,
                TypeError,
              ),
            ),
            powers,
            opts,
          );
        }
        if (propertyKey === AsyncControl) {
          return makeAsyncControl(thisNode, powers, opts);
        }
        if (shadowMethods.has(propertyKey)) {
          return tgt[propertyKey];
        }
        if (propertyKey === Symbol.toPrimitive) {
          // Work around a cycle that locks up the Node.js REPL.
          return undefined;
        }
        const thisArg = getThisArg();
        return makeAsyncNode(thisArg, powers, {
          sendMode,
          thisNode: node,
          boundName: propertyKey,
        });
      },
      has: (_target, _p) => {
        // We just pretend everything exists.
        return true;
      },
      set(target, propertyKey, value, receiver) {
        if (receiver !== node) {
          HandledPromise.reject(
            makeError(
              X`Unexpected receiver ${receiver} for set ${propertyKey}`,
              TypeError,
            ),
          );
          return false;
        }
        if (shadowMethods.has(propertyKey)) {
          return false;
        }
        if (!Reflect.set(target, propertyKey, value)) {
          return false;
        }
        HandledPromise[maybeSO('set')](getThisArg(), propertyKey, value);
        return true;
      },
    }),
  );

  return node;
};

/**
 * @template [A={}]
 * @param {HandledPromiseConstructor} HandledPromise
 * @param {object} [powers]
 * @param {<T>(x: T) => Promise<EUnwrap<T>>} [powers.unwrap]
 * @param {(x: any) => any} [powers.finishTarget]
 * @param {Map<PropertyKey, Callable>} [powers.shadowMethods]
 * @param {A} [powers.additional]
 */
const makeE = (HandledPromise, powers = {}) => {
  const {
    additional = /** @type {A} */ ({}),
    shadowMethods = new Map(
      ['then', 'catch', 'finally'].map(prop => [prop, Promise.prototype[prop]]),
    ),
    unwrap = /** @type {NonNullable<typeof powers.unwrap>} */ (
      HandledPromise.resolve
    ),
    finishTarget = defaultFinishTarget,
  } = powers;

  const asyncPowers = { HandledPromise, finishTarget, shadowMethods, unwrap };

  const E = harden(
    assign(
      /**
       * E(x) lifts `x` into a future turn as a thenable proxy you can call as a
       * function or get arbitrary subproperties. The result of `E(x)(...args)`
       * is `E((await x)(...args))`, and a property reference `E(x)[prop]` is
       * `E((await x)[prop])`. arbitrary methods.  To lower `E(x)` into just
       * `x`, simply `await E(x)`. To simplify unnecessary nesting, `E(E(x))` is
       * exactly the same as just `E(x)`.
       *
       * Example calls are
       *
       * @example
       *  // Send a contract bundle to Zoe for installation.
       *  const installationHandle = await E(zoe).install(bundle);
       *
       *  // Look up some of our friends, and interact with them.
       *  const { alice, bob } = E(friends).getDetails();
       *  // It's only `await`s that yield the current turn.
       *  const [a, b] = await Promise.all([
       *    alice.greet('hello, alice!'),
       *    bob.give(redSweater),
       *  ]);
       *
       * See https://endojs.github.io/endo/functions/_endo_far.E.html for
       * details.
       *
       * @template T
       * @param {T} x target for method/function call
       * @returns {AsyncNode<T>} thenable, function call, and getters proxy
       */
      x => makeAsyncNode(x, asyncPowers),
      {
        /**
         * @deprecated Just use E(x)
         * E.get(x) returns a proxy on which you can get arbitrary properties.
         * Each of these properties returns a promise for the property.  The promise
         * value will be the property fetched from whatever 'x' designates (or
         * resolves to) in a future turn, not this one.
         *
         * @template T
         * @param {T} x target for property get
         * @returns {AsyncNode<T>} thenable, function call, and getters proxy
         * @readonly
         */
        get: x => E(x),

        /**
         * E.resolve(x) converts x to a handled promise. It is
         * shorthand for HandledPromise.resolve(x)
         *
         * @template T
         * @param {T} x value to convert to a handled promise
         * @returns {Promise<Awaited<T>>} handled promise for x
         * @readonly
         */
        resolve: x => HandledPromise.resolve(x),

        /**
         * @deprecated Instead of `E.sendOnly(x)...`, use `void E(x)[E].SendOnly...`
         *
         * E.sendOnly returns a proxy similar to E, but for which the results
         * are ignored (undefined is returned).
         *
         * @template T
         * @param {T} x target for method/function call
         * @returns {AsyncNode<T, true>} thenable, function call, and getters proxy
         * @readonly
         */
        sendOnly: x => E(x)[AsyncControl].SendOnly,

        /**
         * Explicitly escape into the E control space.  Prefer just `[E]` for
         * brevity.
         *
         * @example
         *  E(x)[E.Control]...
         *
         *  // Shorthand:
         *  E(x)[E]...
         * @type {typeof AsyncControl}
         * @readonly
         */
        Control: AsyncControl,

        /**
         * Eventual sendOnly (return Promise<void>, which settles as soon as the
         * operations are queued).
         *
         * @example
         *  // Pipeline the messages, but don't wait for response delays.
         *  await E(x)[E].SendOnly.sayHello().andDontCallBack(...args);
         *
         *  // Synchronous analogy:
         *  void x.sayHello().andDontCallBack(...args);
         * @readonly
         */
        [Symbol.toPrimitive]() {
          return E.Control;
        },

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
      additional,
    ),
  );
  return E;
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
 * @typedef {ERef<Local & RemotableBrand<Local, Primary>>} FarRef
 */

/**
 * `DataOnly<T>` means to return a record type `T2` consisting only of
 * properties that are *not* functions.
 *
 * @template T The type to be filtered.
 * @typedef {Omit<T, FilteredKeys<T, Callable>>} DataOnly
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
 * For the eventual result of an E call, \@see {EResult} or \@see {ECallableReturn}
 *
 * @template {(...args: any[]) => any} T
 * @typedef {T extends (...args: any[]) => infer R ? Awaited<R> : never} EReturn
 */

/**
 * An eventual value where remotable objects are recursively mapped to Remote types
 *
 * @template T
 * @typedef {Awaited<T>} EResult
 */

/**
 * Experimental type mapping remotable objects to Remote types
 *
 * @template T
 * @typedef {(
 *   0 extends (1 & T)                                        // If T is any
 *     ? T                                                    // Propagate the any type through the result
 *     : T extends RemotableBrand<infer L, infer P>           // If we have a Remotable
 *       ? (P | RemotableBrand<L, P>)                         // map it to its "maybe remote" form (primary behavior or remotable presence)
 *       : T extends PromiseLike<infer U>                     // If T is a promise
 *         ? Promise<EAwaitedResult<Awaited<T>>>              // map its resolution
 *         : T extends (null | undefined | string | number | boolean | symbol | bigint | Callable) // Intersections of these types with objects are not mapped
 *           ? T                                              // primitives and non-remotable functions are passed-through
 *           : T extends object                               //
 *             ? { [P in keyof T]: EAwaitedResult<T[P]>; }    // other objects are considered copy data and properties mapped
 *             : T                                            // in case anything wasn't covered, fallback to pass-through
 * )} EAwaitedResult
 */

/**
 * The \@see {EResult} return type of a remote function.
 *
 * @template {(...args: any[]) => any} T
 * @typedef {(
 *   0 extends (1 & T)                          // If T is any
 *     ? any                                    // Propagate the any type through the result
 *     : T extends (...args: any[]) => infer R  // Else infer the return type
 *       ? EResult<R>                           // In the future, map the eventual result
 *       : never
 * )} ECallableReturn
 */

// TODO: Figure out a way to map generic callable return types, or at least better detect them.
// See https://github.com/microsoft/TypeScript/issues/61838. Without that, `E(startGovernedUpgradable)`
// in agoric-sdk doesn't propagate the start function type.
/**
 * Maps a callable to its remotely called type
 *
 * @template {Callable} T
 * @typedef {(
 *    ReturnType<T> extends PromiseLike<infer U>                  // Check if callable returns a promise
 *      ? T                                                       // Bypass mapping to maintain any generic
 *      : (...args: Parameters<T>) => Promise<ECallableReturn<T>> // Map it anyway to ensure promise return type
 * )} ECallable
 */

/**
 * @template T
 * @typedef {{
 *   readonly [P in keyof T]: T[P] extends Callable
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
 * @template {Callable} T
 * @typedef {(...args: Parameters<T>) => Promise<void>} ESendOnlyCallable
 */

/**
 * @template T
 * @typedef {{
 *   readonly [P in keyof T]: T[P] extends Callable
 *     ? ESendOnlyCallable<T[P]>
 *     : never;
 * }} ESendOnlyMethods
 */

/**
 * @template T
 * @typedef {(
 *   0 extends (1 & T)                              // if T is any
 *     ? any                                        // propagate any cleanly
 *     : T extends Callable
 *       ? ESendOnlyCallable<T> & ESendOnlyMethods<Required<T>>
 *       : ESendOnlyMethods<Required<T>>
 * )} ESendOnlyCallableOrMethods
 */

/**
 * @template T
 * @typedef {(
 *   0 extends (1 & T)                              // if T is any
 *     ? any                                        // propagate any cleanly (avoid distributive expansion that displays Pick<any,string>)
 *     : T extends Callable
 *       ? ECallable<T> & EMethods<Required<T>>
 *       : EMethods<Required<T>>
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
 *   0 extends (1 & T)                              // if T is any
 *     ? any                                        // propagate any (avoid Pick<any, string> distributive collapse)
 *     : T extends Callable
 *       ? (...args: Parameters<T>) => ReturnType<T>  // a root callable, no methods
 *       : Pick<T, FilteredKeys<T, Callable>>         // any callable methods
 * )} PickCallable
 */

/**
 * `RemoteFunctions<T>` means to return the functions and properties that are remotely callable.
 *
 * @template T
 * @typedef {(
 *   0 extends (1 & T)                            // if T is any
 *     ? any                                      // propagate any (avoid distributive collapse to Pick<any,string>)
 *     : T extends RemotableBrand<infer L, infer R>   // if a given T is some remote interface R
 *       ? PickCallable<R>                        // then return the callable properties of R
 *       : T extends PromiseLike<infer U>         // otherwise, if T is a promise
 *         ? RemoteFunctions<U>                   // recurse on the resolved value of T
 *         : T                                    // otherwise, return T
 * )} RemoteFunctions
 */

/**
 * @template T
 * @typedef {(
 *   T extends RemotableBrand<infer L, infer R>
 *     ? L
 *     : T extends PromiseLike<infer U>
 *     ? LocalRecord<U>
 *     : T
 * )} LocalRecord
 */

/**
 * @template [R = unknown]
 * @typedef {{
 *   promise: Promise<R>;
 *   settler: Settler<R>;
 * }} EPromiseKit
 */

/**
 * Declare a near object that must only be invoked with E, even locally.  It
 * supports the `T` interface but additionally permits `T`'s methods to return
 * `PromiseLike`s even if `T` declares them as only synchronous.
 *
 * @template T
 * @typedef {(
 *   T extends Callable
 *     ? (...args: Parameters<T>) => ERef<Awaited<EOnly<ReturnType<T>>>>
 *     : T extends Record<PropertyKey, Callable>
 *     ? {
 *         [K in keyof T]: T[K] extends Callable
 *           ? (...args: Parameters<T[K]>) => ERef<Awaited<EOnly<ReturnType<T[K]>>>>
 *           : T[K];
 *       }
 *     : T
 * )} EOnly
 */

/**
 * @template T,U
 * @template {boolean} [SendOnly=false]
 * @typedef {T extends { (...args: infer P): infer R; } ?
 *   { (...args: P): AsyncNode<EUnwrap<R>, SendOnly>; } :
 *   U
 * } AsyncCallable ensure that all callables are async
 */

/**
 * @template T
 * @template {boolean} [SendOnly=false]
 * @typedef { { [K in keyof T]: AsyncCallable<T[K], AsyncNode<Awaited<T[K]>, SendOnly>, SendOnly> } } AsyncShallow
 */

/**
 * @template T
 * @template {boolean} [SendOnly=false]
 * @typedef {bigint extends T ? AsyncShallow<BigIntConstructor['prototype'], SendOnly> :
 *   string extends T ? AsyncShallow<StringConstructor['prototype'], SendOnly> :
 *   boolean extends T ? AsyncShallow<BooleanConstructor['prototype'], SendOnly> :
 *   number extends T ? AsyncShallow<NumberConstructor['prototype'], SendOnly> :
 *   symbol extends T ? AsyncShallow<SymbolConstructor['prototype'], SendOnly> :
 *   {}
 * } AsyncPrimitive Primitives need to be explicitly handled or else their
 * prototype methods aren't asyncified.
 */

/**
 * @template T
 * @template {boolean} [SendOnly=false]
 * @typedef {Omit<AsyncNode<T, SendOnly>, typeof AsyncControl | 'SendOnly' | 'OptChain' | 'catch' | 'then' | 'finally'> &
 *   { SendOnly: AsyncNode<T, true>;
 *     OptChain: T extends undefined ? AsyncNode<T, true> : T extends null ? AsyncNode<T, true> : AsyncNode<T, SendOnly>;
 *     [AsyncControl]: T extends { [AsyncControl]: infer U } ? AsyncNode<U, SendOnly> : never;
 *     catch: T extends { catch: infer U } ? AsyncNode<U, SendOnly>: never;
 *     finally: T extends { finally: infer U } ? AsyncNode<U, SendOnly> : never;
 *     then: T extends { then: infer U } ? AsyncNode<U, SendOnly> : never;
 * }} AsyncControl
 */

/**
 * @template [T=any]
 * @template {boolean} [SendOnly=false]
 * @typedef {Promise<SendOnly extends true ? void : EUnwrap<T>> &
 *  AsyncCallable<T, {}, SendOnly> & AsyncShallow<T, SendOnly> &
 *  AsyncPrimitive<T, SendOnly>} AsyncNode A node is a wrapper for an object on
 *  which operations can be:
 * - `.then, .catch, .finally` act on either
 *   - `Promise<void>` if SendOnly, settled when the operation producing this
 *     node was sent, or
 *   - `Promise<T>` settled with the operation result after the round trip
 * - all other ProxyHandler operations are queued on the future settlement of
 *   this node
 */
