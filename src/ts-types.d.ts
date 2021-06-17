/* eslint-disable */
// eslint-disable-next-line spaced-comment

type ERef<T> = PromiseLike<T> | T;
type Unpromise<T> = T extends ERef<infer U> ? U : T;

export type TrapHandler<T> = T extends (...args: infer P) => infer R
  ? (...args: P) => Unpromise<R>
  : T extends Record<string | number | symbol, Function>
  ? {
      [K in keyof T]: Unpromise<T[K]>;
    }
  : T;

/* Types for Trap proxy calls. */
type TrapSingleMethod<T> = {
  readonly [P in keyof T]: (
    ...args: Parameters<T[P]>
  ) => Unpromise<ReturnType<T[P]>>;
}
type TrapSingleCall<T> = T extends Function ?
  ((...args: Parameters<T>) => Unpromise<ReturnType<T>>) &
    ESingleMethod<Required<T>> : ESingleMethod<Required<T>>;
type TrapSingleGet<T> = {
  readonly [P in keyof T]: Unpromise<T[P]>;
}

export interface Trap {
  /**
   * Trap(x) returns a proxy on which you can call arbitrary methods. Each of
   * these method calls will unwrap a promise result.  The method will be
   * invoked on a remote 'x', and be synchronous from the perspective of this
   * caller.
   *
   * @param {*} x target for method/function call
   * @returns {TrapSingleCall} method/function call proxy
   */
  <T>(x: T): TrapSingleCall<Unpromise<T>>;

  /**
   * Trap.get(x) returns a proxy on which you can get arbitrary properties.
   * Each of these properties unwraps a promise result.  The value will be the
   * property fetched from a remote 'x', and be synchronous from the perspective
   * of this caller.
   *
   * @param {*} x target for property get
   * @returns {TrapSingleGet} property get proxy
   */
  readonly get<T>(x: T): TrapSingleGet<Unpromise<T>>;
}
