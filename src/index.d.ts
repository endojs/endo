/* eslint-disable */
// Type definitions for eventual-send
// TODO: Add jsdocs.

type Property = string | number;

type ERef<T> = PromiseLike<T> | T;

type Unpromise<T> = T extends ERef<infer U> ? U : T;

type Parameters<T> = T extends (...args: infer T) => any ? T : any;
type ReturnType<T> = T extends (...args: any[]) => infer T ? T : any;

interface EHandler<T> {
  get?: (p: T, name: Property) => any;
  applyMethod?: (p: T, name?: Property, args: unknown[]) => any;
}

type HandledExecutor<R> = (
  resolveHandled: (value?: R) => void,
  rejectHandled: (reason?: unknown) => void,
  resolveWithPresence: (presenceHandler: EHandler<{}>) => object,
) => void;

declare interface HandledPromiseConstructor extends PromiseConstructor {
  new <R>(
    executor: HandledExecutor<R>,
    unfulfilledHandler?: EHandler<Promise<unknown>>
  );
  prototype: Promise<unknown>;
  applyFunction(target: unknown, args: unknown[]): Promise<unknown>;
  applyFunctionSendOnly(target: unknown, args: unknown[]): void;
  applyMethod(
    target: unknown,
    prop: Property | undefined,
    args: unknown[]
  ): Promise<unknown>;
  applyMethodSendOnly(target: unknown, prop: Property, args: unknown[]): void;
  get(target: unknown, prop: Property): Promise<unknown>;
  getSendOnly(target: unknown, prop: Property): void;
}

declare var HandledPromise: HandledPromiseConstructor;

namespace global {
  declare var HandledPromise: HandledPromiseConstructor;
}

declare function makeHandledPromise(): HandledPromiseConstructor;

/* Types for E proxy calls. */
type ESingleMethod<T> = {
  readonly [P in keyof T]: (
    ...args: Parameters<T[P]>
  ) => Promise<Unpromise<ReturnType<T[P]>>>;
}
type ESingleCall<T> = T extends Function ?
  ((...args: Parameters<T>) => Promise<Unpromise<ReturnType<T>>>) &
    ESingleMethod<Required<T>> : ESingleMethod<Required<T>>;
type ESingleGet<T> = {
  readonly [P in keyof T]: Promise<Unpromise<T[P]>>;
}

/* Same types for send-only. */
type ESingleMethodOnly<T> = {
  readonly [P in keyof T]: (...args: Parameters<T[P]>) => void;
}
type ESingleCallOnly<T> = T extends Function ?
  ((...args: Parameters<T>) => void) & ESingleMethodOnly<T> :
  ESingleMethodOnly<T>;
type ESingleGetOnly<T> = {
  readonly [P in keyof T]: void;
}

interface ESendOnly {
  <T>(x: T): ESingleCallOnly<Unpromise<T>, void>;
}

interface EProxy {
  /**
   * E(x) returns a proxy on which you can call arbitrary methods. Each of
   * these method calls returns a promise. The method will be invoked on
   * whatever 'x' designates (or resolves to) in a future turn, not this
   * one.
   *
   * @param {*} x target for method/function call
   * @returns {ESingleCall} method/function call proxy
   */
  <T>(x: T): ESingleCall<Unpromise<T>>;
  /**
   * @deprecated use E.get(x) instead
   */
  readonly G<T>(x: T): ESingleGet<Unpromise<T>>;

  /**
   * E.get(x) returns a proxy on which you can get arbitrary properties.
   * Each of these properties returns a promise for the property.  The promise
   * value will be the property fetched from whatever 'x' designates (or
   * resolves to) in a future turn, not this one.
   *
   * @param {*} x target for property get
   * @returns {ESingleGet} property get proxy
   */
  readonly get<T>(x: T): ESingleGet<Unpromise<T>>;

  /**
   * E.resolve(x) converts x to a handled promise. It is
   * shorthand for HandledPromise.resolve(x)
   */
  readonly resolve<T>(x: T): Promise<Unpromise<T>>;

  /**
   * E.when(x, res, rej) is equivalent to
   * HandledPromise.resolve(x).then(res, rej)
   */
  readonly when<T,U>(
    x: T,
    onfulfilled?: (value: Unpromise<T>) => ERef<U>,
    onrejected?: (reason: any) => ERef<U>,
  ): Promise<U>;

  /**
   * E.sendOnly returns a proxy similar to E, but for which the results
   * are ignored (undefined is returned).
   */
  readonly sendOnly: ESendOnly;
}

export const E: EProxy;
