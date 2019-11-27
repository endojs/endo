// Type definitions for eventual-send
// TODO: Add jsdocs.

type Property = string | number | symbol;

interface HandledPromiseConstructor {
  prototype: Promise<unknown>;
  applyFunction(target: unknown, args: unknown[]): Promise<unknown>;
  applyFunctionSendOnly(target: unknown, args: unknown[]): void;
  applyMethod(target: unknown, prop: Property, args: unknown[]): Promise<unknown>;
  applyMethodSendOnly(target: unknown, prop: Property, args: unknown[]): void;
  delete(target: unknown, prop: Property): Promise<boolean>;
  deleteSendOnly(target: unknown, prop: Property): void;
  get(target: unknown, prop: Property): Promise<unknown>;
  getSendOnly(target: unknown, prop: Property): void;
  has(target: unknown, prop: Property): Promise<boolean>;
  hasSendOnly(target: unknown, prop: Property): void;
  set<T = unknown>(target: unknown, prop: Property, value: T): Promise<T>;
  setSendOnly(target: unknown, prop: Property, value: unknown): void;
}

declare const HandledPromise: HandledPromiseConstructor;

interface ESingleMethod {
  (...args: unknown[]): Promise<unknown>;
  [prop: Property]: (...args) => Promise<unknown>;
}

interface ESingleGet {
  [prop: Property]: Promise<unknown>;
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
  sendOnly: (x: unknown) => ESingleMethod;
  /**
   * E.G(x) returns a proxy on which you can get arbitrary properties.
   * Each of these properties returns a promise.  The property will be
   * taken from whatever 'x' designates (or resolves to) in a future turn,
   * not this one.
   * 
   * @param {*} x target for property get
   * @returns {ESingleGet} property get proxy
   */
  G(x: unknown): ESingleGet;
}

export const E: EProxy;

interface EHandler {
  GET(p: EPromise<unknown>, name: Property): EPromise<unknown>;
  PUT(p: EPromise<unknown>, name: Property, value: unknown): EPromise<void>;
  DELETE(p: EPromise<unknown>, name: Property): EPromise<boolean>;
  POST(p: EPromise<unknown>, name?: Property, args: unknown[]): EPromise<unknown>;
}

export interface EPromise<R> extends Promise<R> {
  get(name: Property): EPromise<unknown>;
  put(name: Property, value: unknown): EPromise<void>;
  delete(name: Property): EPromise<boolean>;
  post(name?: Property, args: unknown[]): EPromise<unknown>;
  invoke(name: Property, ...args: unknown[]): EPromise<unknown>;
  fapply(args: unknown[]): EPromise<unknown>;
  fcall(...args: unknown[]): EPromise<unknown>;
  then<TResult1 = R, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ) => EPromise<TResult1 | TResult2>;
  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ) => EPromise<R | TResult>;
  finally(onfinally?: (() => void) | undefined | null): EPromise<R>;
}

interface FulfilledStatus {
  status: 'fulfilled';
  value: unknown;
}

interface RejectedStatus {
  status: 'rejected';
  reason: unknown;
}

type SettledStatus = FulfilledStatus | RejectedStatus;

type HandledExecutor<R> = (
  resolveHandled: (value?: R) => void,
  rejectHandled: (reason?: unknown) => void,
  resolveWithPresence: (presenceHandler: EHandler) => object,
) => void;

interface EPromiseConstructor extends PromiseConstructor {
  prototype: EPromise<unknown>;
  makeHandled<R>(executor: HandledExecutor<R>, unfulfilledHandler?: EHandler): EPromise<R>;
  resolve<R>(value: R): EPromise<R>;
  reject(reason: unknown): EPromise<never>;
  all(iterable: Iterable): EPromise<unknown[]>;
  allSettled(iterable: Iterable): EPromise<SettledStatus[]>;
  race(iterable: Iterable): EPromise<unknown>; 
}

export default function maybeExtendPromise(Promise: PromiseConstructor): EPromiseConstructor;
