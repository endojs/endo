// Type definitions for eventual-send
// TODO: Add jsdocs.

type Property = string | number | symbol;

interface EHandler {
  get(p: Promise<unknown>, name: Property): Promise<unknown>;
  applyMethod(p: Promise<unknown>, name?: Property, args: unknown[]): Promise<unknown>;
}

type HandledExecutor<R> = (
  resolveHandled: (value?: R) => void,
  rejectHandled: (reason?: unknown) => void,
  resolveWithPresence: (presenceHandler: EHandler) => object,
) => void;

interface HandledPromiseConstructor {
  new<R> (executor: HandledExecutor<R>);
  prototype: Promise<unknown>;
  applyFunction(target: unknown, args: unknown[]): Promise<unknown>;
  applyFunctionSendOnly(target: unknown, args: unknown[]): void;
  applyMethod(target: unknown, prop: Property, args: unknown[]): Promise<unknown>;
  applyMethodSendOnly(target: unknown, prop: Property, args: unknown[]): void;
  get(target: unknown, prop: Property): Promise<unknown>;
  getSendOnly(target: unknown, prop: Property): void;
}

export const HandledPromise: HandledPromiseConstructor;

interface ESingleMethod<R = Promise<unknown>> {
  (...args: unknown[]): R;
  readonly [prop: Property]: (...args: unknown[]) => R;
}

interface ESingleGet<R = Promise<unknown>> {
  readonly [prop: Property]: R;
}

interface ESendOnly {
  (x: unknown): ESingleMethod<void>;
  readonly G(x: unknown): ESingleGet<void>;
}

interface EProxy {
  /**
   * E(x) returns a proxy on which you can call arbitrary methods. Each of
   * these method calls returns a promise. The method will be invoked on
   * whatever 'x' designates (or resolves to) in a future turn, not this
   * one.
   * 
   * @param {*} x target for method call
   * @returns {ESingleMethod} method call proxy
   */
  (x: unknown): ESingleMethod;
  /**
   * E.G(x) returns a proxy on which you can get arbitrary properties.
   * Each of these properties returns a promise for the property.  The promise
   * value will be the property fetched from whatever 'x' designates (or resolves to)
   * in a future turn, not this one.
   * 
   * @param {*} x target for property get
   * @returns {ESingleGet} property get proxy
   */
  readonly G(x: unknown): ESingleGet;

  /**
   * E.sendOnly returns a proxy similar to E, but for which the results
   * are ignored (undefined is returned).
   */
  readonly sendOnly: ESendOnly;
}

export const E: EProxy;
