/* eslint-disable */
// eslint-disable-next-line spaced-comment

type ERef<T> = PromiseLike<T> | T;
type Unpromise<T> = T extends ERef<infer U> ? U : T;

export type Syncable<T> = T extends (...args: infer P) => infer R
  ? (...args: P) => Unpromise<R>
  : T extends Record<string | number | symbol, Function>
  ? {
      [K in keyof T]: Unpromise<T[K]>;
    }
  : T;

/* Types for Sync proxy calls. */
type SyncSingleMethod<T> = {
  readonly [P in keyof T]: (
    ...args: Parameters<T[P]>
  ) => Unpromise<ReturnType<T[P]>>;
}
type SyncSingleCall<T> = T extends Function ?
  ((...args: Parameters<T>) => Unpromise<ReturnType<T>>) &
    ESingleMethod<Required<T>> : ESingleMethod<Required<T>>;
type SyncSingleGet<T> = {
  readonly [P in keyof T]: Unpromise<T[P]>;
}

export interface Sync {
  /**
   * Sync(x) returns a proxy on which you can call arbitrary methods. Each of
   * these method calls will unwrap a promise result.  The method will be
   * invoked on a remote 'x', and be synchronous from the perspective of this
   * caller.
   *
   * @param {*} x target for method/function call
   * @returns {SyncSingleCall} method/function call proxy
   */
  <T>(x: T): SyncSingleCall<Unpromise<T>>;

  /**
   * Sync.get(x) returns a proxy on which you can get arbitrary properties.
   * Each of these properties unwraps a promise result.  The value will be the
   * property fetched from a remote 'x', and be synchronous from the perspective
   * of this caller.
   *
   * @param {*} x target for property get
   * @returns {SyncSingleGet} property get proxy
   */
  readonly get<T>(x: T): SyncSingleGet<Unpromise<T>>;
}
