import harden from '@endo/harden';
import { trackTurns } from './track-turns.js';
import { makeMessageBreakpointTester } from './message-breakpoints.js';

import type {
  HandledPromiseConstructor,
  RemotableBrand,
  Callable,
  Settler,
} from './types.js';

const { details: X, quote: q, Fail, error: makeError } = assert;
const { assign, freeze } = Object;

/**
 * @see {@link https://github.com/microsoft/TypeScript/issues/31394}
 * Declare that `T` may or may not be a Promise.  This should be used only for
 * consumers of arguments and declarations; return values should specifically be
 * `Promise<T>` or `T` itself.
 */
export type ERef<T> = PromiseLike<T> | T;

/**
 * Return a union of property names/symbols/numbers P for which the record element T[P]'s type extends U.
 *
 * Given const x = { a: 123, b: 'hello', c: 42, 49: () => {}, 53: 67 },
 *
 * FilteredKeys<typeof x, number> is the type 'a' | 'c' | 53.
 * FilteredKeys<typeof x, string> is the type 'b'.
 * FilteredKeys<typeof x, 42 | 67> is the type 'c' | 53.
 * FilteredKeys<typeof x, boolean> is the type never.
 */
export type FilteredKeys<T, U> = {
  [P in keyof T]: T[P] extends U ? P : never;
}[keyof T];

/**
 * `DataOnly<T>` means to return a record type `T2` consisting only of
 * properties that are *not* functions.
 */
export type DataOnly<T> = Omit<T, FilteredKeys<T, Callable>>;

/**
 * Declare an object that is potentially a far reference of type Primary whose
 * auxilliary data has type Local.  This should be used only for consumers of
 * Far objects in arguments and declarations; the only creators of Far objects
 * are distributed object creator components like the `Far` or `Remotable`
 * functions.
 */
export type FarRef<Primary, Local = DataOnly<Primary>> = ERef<
  Local & RemotableBrand<Local, Primary>
>;

/**
 * The awaited return type of a function.
 * For the eventual result of an E call, @see {EResult} or @see {ECallableReturn}
 */
export type EReturn<T extends (...args: any[]) => any> = T extends (
  ...args: any[]
) => infer R
  ? Awaited<R>
  : never;

/**
 * An eventual value where remotable objects are recursively mapped to Remote types
 */
export type EResult<T> = Awaited<T>;

/**
 * Experimental type mapping remotable objects to Remote types
 */
export type EAwaitedResult<T> = 0 extends 1 & T // If T is any
  ? T // Propagate the any type through the result
  : T extends RemotableBrand<infer L, infer P> // If we have a Remotable
    ? P | RemotableBrand<L, P> // map it to its "maybe remote" form (primary behavior or remotable presence)
    : T extends PromiseLike<infer _U> // If T is a promise
      ? Promise<EAwaitedResult<Awaited<T>>> // map its resolution
      : T extends
            | null
            | undefined
            | string
            | number
            | boolean
            | symbol
            | bigint
            | Callable // Intersections of these types with objects are not mapped
        ? T // primitives and non-remotable functions are passed-through
        : T extends object //
          ? { [P in keyof T]: EAwaitedResult<T[P]> } // other objects are considered copy data and properties mapped
          : T; // in case anything wasn't covered, fallback to pass-through

/**
 * The @see {EResult} return type of a remote function.
 */
export type ECallableReturn<T extends (...args: any[]) => any> = 0 extends 1 & T // If T is any
  ? any // Propagate the any type through the result
  : T extends (...args: any[]) => infer R // Else infer the return type
    ? EResult<R> // In the future, map the eventual result
    : never;

// TODO: Figure out a way to map generic callable return types, or at least better detect them.
// See https://github.com/microsoft/TypeScript/issues/61838. Without that, `E(startGovernedUpgradable)`
// in agoric-sdk doesn't propagate the start function type.
/**
 * Maps a callable to its remotely called type
 */
export type ECallable<T extends Callable> =
  ReturnType<T> extends PromiseLike<infer _U> // Check if callable returns a promise
    ? T // Bypass mapping to maintain any generic
    : (...args: Parameters<T>) => Promise<ECallableReturn<T>>; // Map it anyway to ensure promise return type

export type EMethods<T> = {
  readonly [P in keyof T]: T[P] extends Callable ? ECallable<T[P]> : never;
};

export type EGetters<T> = {
  readonly [P in keyof T]: T[P] extends PromiseLike<infer _U>
    ? T[P]
    : Promise<Awaited<T[P]>>;
};

export type ESendOnlyCallable<T extends Callable> = (
  ...args: Parameters<T>
) => Promise<void>;

export type ESendOnlyMethods<T> = {
  readonly [P in keyof T]: T[P] extends Callable
    ? ESendOnlyCallable<T[P]>
    : never;
};

export type ESendOnlyCallableOrMethods<T> = T extends Callable
  ? ESendOnlyCallable<T> & ESendOnlyMethods<Required<T>>
  : 0 extends 1 & T
    ? never
    : ESendOnlyMethods<Required<T>>;

export type ECallableOrMethods<T> = T extends Callable
  ? ECallable<T> & EMethods<Required<T>>
  : 0 extends 1 & T
    ? never
    : EMethods<Required<T>>;

/**
 * `PickCallable<T>` means to return a single root callable or a record type
 * consisting only of properties that are functions.
 */
export type PickCallable<T> = T extends Callable
  ? (...args: Parameters<T>) => ReturnType<T> // a root callable, no methods
  : Pick<T, FilteredKeys<T, Callable>>; // any callable methods

/**
 * `RemoteFunctions<T>` means to return the functions and properties that are remotely callable.
 */
export type RemoteFunctions<T> =
  T extends RemotableBrand<infer _L, infer R> // if a given T is some remote interface R
    ? PickCallable<R> // then return the callable properties of R
    : T extends PromiseLike<infer U> // otherwise, if T is a promise
      ? RemoteFunctions<U> // recurse on the resolved value of T
      : T; // otherwise, return T

export type LocalRecord<T> =
  T extends RemotableBrand<infer L, infer _R>
    ? L
    : T extends PromiseLike<infer U>
      ? LocalRecord<U>
      : T;

export type EPromiseKit<R = unknown> = {
  promise: Promise<R>;
  settler: Settler<R>;
};

/**
 * Declare a near object that must only be invoked with E, even locally.  It
 * supports the `T` interface but additionally permits `T`'s methods to return
 * `PromiseLike`s even if `T` declares them as only synchronous.
 */
export type EOnly<T> = T extends Callable
  ? (...args: Parameters<T>) => ERef<Awaited<EOnly<ReturnType<T>>>>
  : T extends Record<PropertyKey, Callable>
    ? {
        [K in keyof T]: T[K] extends Callable
          ? (
              ...args: Parameters<T[K]>
            ) => ERef<Awaited<EOnly<ReturnType<T[K]>>>>
          : T[K];
      }
    : T;

const onSend = makeMessageBreakpointTester('ENDO_SEND_BREAKPOINTS');

const baseFreezableProxyHandler: ProxyHandler<any> = {
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

const makeProxy = <T>(target: object, handler: ProxyHandler<object>): T =>
  new Proxy(target, handler) as T;

const toBreakpointProperty = (
  propertyKey: PropertyKey,
): string | symbol | undefined =>
  typeof propertyKey === 'number' ? `${propertyKey}` : propertyKey;

const makeEMethod = (
  recipient: any,
  propertyKey: PropertyKey,
  receiver: object,
  HandledPromise: HandledPromiseConstructor,
): ((this: unknown, ...args: any[]) => Promise<unknown>) => {
  const methods: Record<
    PropertyKey,
    (this: unknown, ...args: any[]) => Promise<unknown>
  > = {
    [propertyKey](...args: any[]): Promise<unknown> {
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

      if (
        onSend &&
        onSend.shouldBreakpoint(recipient, toBreakpointProperty(propertyKey))
      ) {
        // eslint-disable-next-line no-debugger
        debugger; // LOOK UP THE STACK
        // Stopped at a breakpoint on eventual-send of a method-call
        // message,
        // so that you can walk back on the stack to see how we came to
        // make this eventual-send
      }
      return HandledPromise.applyMethod(recipient, propertyKey, args);
    },
  };
  return harden(methods[propertyKey]!);
};

const makeESendOnlyMethod = (
  recipient: any,
  propertyKey: PropertyKey,
  receiver: object,
  HandledPromise: HandledPromiseConstructor,
): ((this: unknown, ...args: any[]) => undefined) => {
  const methods: Record<
    PropertyKey,
    (this: unknown, ...args: any[]) => undefined
  > = {
    [propertyKey](...args: any[]): undefined {
      // Throw since the function returns nothing
      this === receiver ||
        Fail`Unexpected receiver for "${q(
          propertyKey,
        )}" method of E.sendOnly(${q(recipient)})`;
      if (
        onSend &&
        onSend.shouldBreakpoint(recipient, toBreakpointProperty(propertyKey))
      ) {
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
  };
  return harden(methods[propertyKey]!);
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
 */
const makeEProxyHandler = (
  recipient: any,
  HandledPromise: HandledPromiseConstructor,
): ProxyHandler<object> =>
  harden({
    ...baseFreezableProxyHandler,
    get: (_target, propertyKey, receiver) =>
      makeEMethod(recipient, propertyKey, receiver, HandledPromise),
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
 */
const makeESendOnlyProxyHandler = (
  recipient: any,
  HandledPromise: HandledPromiseConstructor,
): ProxyHandler<object> =>
  harden({
    ...baseFreezableProxyHandler,
    get: (_target, propertyKey, receiver) =>
      makeESendOnlyMethod(recipient, propertyKey, receiver, HandledPromise),
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
 */
const makeEGetProxyHandler = (
  x: any,
  HandledPromise: HandledPromiseConstructor,
): ProxyHandler<object> =>
  harden({
    ...baseFreezableProxyHandler,
    has: (_target, _prop) => true,
    get: (_target, prop) => HandledPromise.get(x, prop),
  });

/**
 * `freeze` but not `harden` the proxy target so it remains trapping.
 * Thus, it should not be shared outside this module.
 *
 * @see https://github.com/endojs/endo/blob/master/packages/ses/docs/preparing-for-stabilize.md
 */
const funcTarget = freeze(() => {});

/**
 * `freeze` but not `harden` the proxy target so it remains trapping.
 * Thus, it should not be shared outside this module.
 *
 * @see https://github.com/endojs/endo/blob/master/packages/ses/docs/preparing-for-stabilize.md
 */
const objTarget = freeze({ __proto__: null });

const makeE = (HandledPromise: HandledPromiseConstructor) => {
  return harden(
    assign(
      /**
       * E(x) returns a proxy on which you can call arbitrary methods. Each of these
       * method calls returns a promise. The method will be invoked on whatever
       * 'x' designates (or resolves to) in a future turn, not this one.
       *
       * An example call would be
       *
       * E(zoe).install(bundle)
       *   .then(installationHandle => { ... })
       *   .catch(err => { ... });
       *
       *  See https://endojs.github.io/endo/functions/_endo_far.E.html for details.
       */
      <T>(x: T): ECallableOrMethods<RemoteFunctions<T>> =>
        makeProxy(funcTarget, makeEProxyHandler(x, HandledPromise)),
      {
        /**
         * E.get(x) returns a proxy on which you can get arbitrary properties.
         * Each of these properties returns a promise for the property.  The promise
         * value will be the property fetched from whatever 'x' designates (or
         * resolves to) in a future turn, not this one.
         */
        get: <T>(x: T): EGetters<LocalRecord<T>> =>
          makeProxy(objTarget, makeEGetProxyHandler(x, HandledPromise)),

        /**
         * E.resolve(x) converts x to a handled promise. It is
         * shorthand for HandledPromise.resolve(x)
         */
        resolve: HandledPromise.resolve as <T>(x: T) => Promise<Awaited<T>>,

        /**
         * E.sendOnly returns a proxy similar to E, but for which the results
         * are ignored (undefined is returned).
         */
        sendOnly: <T>(x: T): ESendOnlyCallableOrMethods<RemoteFunctions<T>> =>
          makeProxy(funcTarget, makeESendOnlyProxyHandler(x, HandledPromise)),

        /**
         * E.when(x, res, rej) is equivalent to
         * HandledPromise.resolve(x).then(res, rej)
         */
        when: <T, U = T>(
          x: T | PromiseLike<T>,
          onfulfilled?: (value: T) => ERef<U>,
          onrejected?: (reason: any) => ERef<U>,
        ): Promise<U> =>
          HandledPromise.resolve(x).then(
            ...trackTurns([onfulfilled, onrejected]),
          ),
      },
    ),
  );
};

export default makeE;

export type EProxy = ReturnType<typeof makeE>;
