// Type definitions for eventual-send
// TODO: Add jsdocs.

type Property = string | number | symbol;

type PromiseLikeOrNot<T> = PromiseLike<T> | T;

type Unpromise<T> = T extends PromiseLikeOrNot<infer U> ? U : T;

type Parameters<T> = T extends (... args: infer T) => any ? T : never; 
type ReturnType<T> = T extends (... args: any[]) => infer T ? T : never;

interface EHandler<T> {
  get?: (p: T, name: Property) => any;
  applyMethod?: (p: T, name?: Property, args: unknown[]) => any;
}

type HandledExecutor<R> = (
  resolveHandled: (value?: R | PromiseLike<R>) => void,
  rejectHandled: (reason?: any) => void,
  resolveWithPresence: <T>(presenceHandler: EHandler<T>) => object,
) => void;

interface HandledPromiseConstructor extends PromiseConstructorLike {
  new<R> (executor: HandledExecutor<R>, unfulfilledHandler?: EHandler<Promise<unknown>>): Promise<R> & { domain: any };
  prototype: Promise<unknown>;
  applyFunction(target: unknown, args: unknown[]): Promise<unknown>;
  applyFunctionSendOnly(target: unknown, args: unknown[]): void;
  applyMethod(target: unknown, prop: Property, args: unknown[]): Promise<unknown>;
  applyMethodSendOnly(target: unknown, prop: Property, args: unknown[]): void;
  get(target: unknown, prop: Property): Promise<unknown>;
  getSendOnly(target: unknown, prop: Property): void;
  resolve(target: unknown): Promise<any>;
}

export const HandledPromise: HandledPromiseConstructor;

/* Types for E proxy calls. */
type ESingleMethod<T> = {
  readonly [P in keyof T]: (...args: Parameters<T[P]>) => Promise<Unpromise<ReturnType<T[P]>>>;
}
type ESingleCall<T> = T extends Function ?
  ((...args: Parameters<T>) => Promise<Unpromise<ReturnType<T>>>) & ESingleMethod<T> :
  ESingleMethod<T>;
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
  readonly G<T>(x: T): ESingleGetOnly<Unpromise<T>>;
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
   * E.G(x) returns a proxy on which you can get arbitrary properties.
   * Each of these properties returns a promise for the property.  The promise
   * value will be the property fetched from whatever 'x' designates (or resolves to)
   * in a future turn, not this one.
   * 
   * @param {*} x target for property get
   * @returns {ESingleGet} property get proxy
   */
  readonly G<T>(x: T): ESingleGet<Unpromise<T>>;

  /**
   * E.when(x) converts x to a promise.
   */
  readonly when<T>(x: T): Promise<Unpromise<T>>;

  /**
   * E.when(x, res, rej) is equivalent to HandledPromise.resolve(x).then(res, rej)
   */
  readonly when<T>(
    x: T,
    onfulfilled: (value: Unpromise<T>) => any | PromiseLike<any> | undefined,
    onrejected?: (reason: any) => PromiseLike<never>,
  ): Promise<any>;

  /**
   * E.sendOnly returns a proxy similar to E, but for which the results
   * are ignored (undefined is returned).
   */
  readonly sendOnly: ESendOnly;
}

export const E: EProxy;
