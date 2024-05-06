/* eslint-disable */
// eslint-disable-next-line spaced-comment

// @ts-expect-error FIXME these aren't defined
import type { ESingleMethod, Unpromise } from '@endo/eventual-send';

/**
 * In order to type using Trap with a handler TrapHandler<T>, this template type
 * examines its parameter, and transforms any Promise<R> function return types
 * or Promise<R> object property types into the corresponding resolved type R.
 *
 * That correctly describes that Trap(target)... "unpromises" any results.
 */
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
    // @ts-expect-error FIXME Type 'T[P]' does not satisfy the constraint '(...args: any) => any'.
    ...args: Parameters<T[P]>
    // @ts-expect-error FIXME ditto
  ) => Unpromise<ReturnType<T[P]>>;
};
type TrapSingleCall<T> = T extends Function
  ? // @ts-expect-error FIXME ditto
    ((...args: Parameters<T>) => Unpromise<ReturnType<T>>) &
      ESingleMethod<Required<T>>
  : ESingleMethod<Required<T>>;
type TrapSingleGet<T> = {
  readonly [P in keyof T]: Unpromise<T[P]>;
};

export interface Trap {
  /**
   * @template T
   *
   * Trap(x) returns a proxy on which you can call arbitrary methods. Each of
   * these method calls will unwrap a promise result.  The method will be
   * invoked on a remote 'x', and be synchronous from the perspective of this
   * caller.
   *
   * @param {T} x target for method/function call
   * @returns {TrapSingleCall<Unpromise<T>>} method/function call proxy
   */
  <T>(x: T): TrapSingleCall<Unpromise<T>>;

  /**
   * @template T
   *
   * Trap.get(x) returns a proxy on which you can get arbitrary properties.
   * Each of these properties unwraps a promise result.  The value will be the
   * property fetched from a remote 'x', and be synchronous from the perspective
   * of this caller.
   *
   * @param {T} x target for property get
   * @returns {TrapSingleGet<Unpromise<T>>} property get proxy
   */
  get<T>(x: T): TrapSingleGet<Unpromise<T>>;
}
