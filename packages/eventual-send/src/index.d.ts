import * as _E from './E.js';

// Exposing types directly per the jsdoc annotations and comments.
//
//   See: https://grep.app/search?q=%5E%20%2A%28export%20%2B%29import%20%2A%5Cw%2B%20%2A%3D&regexp=true&filter[repo][0]=microsoft/TypeScript&filter[path][0]=tests/
//
//   Note: Some types will not include the jsdoc docs, but
//         those still propagate for the source entities of
//         the respective annotations. Types exported below
//         are intended for type-checking against decoupled
//         references between packages.

export import RemotableBrand = _E.RemotableBrand;
export import DataOnly = _E.DataOnly;
export import FarRef = _E.FarRef;
export import EProxy = _E.EProxy;

// Type definitions for eventual-send

/**
 * @file Type definitions for @agoric/eventual-send
 *
 * Some useful background knowledge:
 *
 * `Omit<T, U>` means to return a record type `T2` which has none of the properties whose keys are part of `U`.
 * `Omit<{a: 1, b: 2, c: 3}, 'b'>` is the type `{a: 1, c: 3}`.
 *
 * `Pick<T, U>` means to return a record type `T2` which has only the properties whose keys are part of `U`.
 * `Pick<{a: 1, b: 2, c: 3}, 'b'>` is the type `{b: 2}`.
 *
 * `PromiseLike<T>` is a thenable which resolves to `T`.
 *
 * `Promise<PromiseLike<T>>` doesn't handle recursion and is distinct from `T`.
 *
 * `Unpromise<PromiseLike<T>>` strips off just one layer and is just `T`.  `Unpromise<PromiseLike<PromiseLIke<T>>` is `PromiseLike<T>`.
 *
 * `Awaited<PromiseLike<T>>` recurses, and is just `T`.
 * `Awaited<PromiseLike<PromiseLike<T>>>` is just `T` as well.
 *
 * @see {@link https://www.typescriptlang.org/docs/handbook/2/generics.html#handbook-content}
 * @see {@link https://www.typescriptlang.org/docs/handbook/2/conditional-types.html}
 */

export type Callable = (...args: any[]) => any;

// Same as https://github.com/microsoft/TypeScript/issues/31394
export type ERef<T> = PromiseLike<T> | T;

export declare const EmptyObj: {};

// Type for an object that must only be invoked with E.  It supports a given
// interface but declares all the functions as asyncable.
export type EOnly<T> = T extends (...args: infer P) => infer R
  ? (...args: P) => ERef<Awaited<R>> | EOnly<Awaited<R>>
  : T extends Record<PropertyKey, Callable>
  ? ERef<{
      [K in keyof T]: EOnly<T[K]>;
    }>
  : ERef<T>;

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
 * `PickCallable<T>` means to return a single root callable or a record type
 * consisting only of properties that are functions.
 */
export type PickCallable<T> = T extends Callable
  ? (...args: Parameters<T>) => ReturnType<T> // a root callable, no methods
  : Pick<T, FilteredKeys<T, Callable>>; // any callable methods

/**
 * `RemoteFunctions<T>` means to return the functions and properties that are remotely callable.
 */
export type RemoteFunctions<T> = T extends RemotableBrand<infer L, infer R> // if a given T is some remote interface R
  ? PickCallable<R> // then use the function properties of R
  : Awaited<T> extends RemotableBrand<infer L, infer R> // otherwise, if the final resolution of T is some remote interface R
  ? PickCallable<R> // then use the function properties of R
  : T extends PromiseLike<infer U>
  ? Awaited<T> // otherwise, use the final resolution of that T
  : T;

export type LocalRecord<T> = T extends RemotableBrand<infer L, infer R>
  ? L
  : Awaited<T> extends RemotableBrand<infer L, infer R>
  ? L
  : T extends PromiseLike<infer U>
  ? Awaited<T>
  : T;
export interface EHandler<T> {
  get?: (p: T, name: PropertyKey, returnedP?: Promise<unknown>) => unknown;
  getSendOnly?: (p: T, name: PropertyKey) => void;
  applyFunction?: (
    p: T,
    args: unknown[],
    returnedP?: Promise<unknown>,
  ) => unknown;
  applyFunctionSendOnly?: (p: T, args: unknown[]) => void;
  applyMethod?: (
    p: T,
    name: PropertyKey | undefined,
    args: unknown[],
    returnedP?: Promise<unknown>,
  ) => unknown;
  applyMethodSendOnly?: (
    p: T,
    name: PropertyKey | undefined,
    args: unknown[],
  ) => void;
}

export type ResolveWithPresenceOptionsBag<T extends object> = {
  proxy?: {
    handler: ProxyHandler<T>;
    target: unknown;
    revokerCallback?: (revoker: () => void) => void;
  };
};

export type HandledExecutor<R = unknown> = (
  resolveHandled: (value?: R) => void,
  rejectHandled: (reason?: unknown) => void,
  resolveWithPresence: (
    presenceHandler: EHandler<{}>,
    options?: ResolveWithPresenceOptionsBag<{}>,
  ) => object,
) => void;

declare interface Settler<R = unknown> {
  resolve: (value?: R) => void;
  reject: (reason?: unknown) => void;
  resolveWithPresence: (
    presenceHandler?: EHandler<{}>,
    options?: ResolveWithPresenceOptionsBag<{}>,
  ) => object;
}

declare interface RemoteKit<R = unknown> {
  promise: Promise<R>;
  settler: Settler<R>;
}

declare interface HandledPromiseStaticMethods {
  applyFunction(target: unknown, args: unknown[]): Promise<unknown>;
  applyFunctionSendOnly(target: unknown, args: unknown[]): void;
  applyMethod(
    target: unknown,
    prop: PropertyKey | undefined,
    args: unknown[],
  ): Promise<unknown>;
  applyMethodSendOnly(
    target: unknown,
    prop: PropertyKey,
    args: unknown[],
  ): void;
  get(target: unknown, prop: PropertyKey): Promise<unknown>;
  getSendOnly(target: unknown, prop: PropertyKey): void;
}

export interface HandledPromiseConstructor
  extends PromiseConstructor,
    HandledPromiseStaticMethods {
  new <R>(
    executor: HandledExecutor<R>,
    unfulfilledHandler?: EHandler<Promise<unknown>>,
  ): Promise<R>;
  prototype: Promise<unknown>;
}

declare namespace global {
  // eslint-disable-next-line vars-on-top,no-var
  var HandledPromise: HandledPromiseConstructor;
}

export declare const HandledPromise: HandledPromiseConstructor;

/**
 * "E" short for "Eventual", what we call something that has to return a promise.
 */
type ECallable<T extends Callable> = ReturnType<T> extends PromiseLike<infer U>
  ? T // function already returns a promise
  : (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>; // make it return a promise

/* Types for E proxy calls. */

/**
 * Transform each function in T to return a promise
 */
type EMethods<T> = {
  readonly [P in keyof T]: T[P] extends Callable ? ECallable<T[P]> : never;
};

type ECallableOrMethods<T> = T extends Callable
  ? ECallable<T> & EMethods<Required<T>>
  : EMethods<Required<T>>;

type EGetters<T> = {
  readonly [P in keyof T]: T[P] extends PromiseLike<infer U>
    ? T[P]
    : Promise<Awaited<T[P]>>;
};

/* Same types for send-only. */
type ESendOnlyCallable<T extends Callable> = (
  ...args: Parameters<T>
) => Promise<void>;

type ESendOnlyMethods<T> = {
  readonly [P in keyof T]: T[P] extends Callable
    ? ESendOnlyCallable<T[P]>
    : never;
};

type ESendOnlyCallableOrMethods<T> = T extends Callable
  ? ESendOnlyCallable<T> & ESendOnlyMethods<Required<T>>
  : ESendOnlyMethods<Required<T>>;

interface ESendOnly {
  <T>(x: T): ESendOnlyCallableOrMethods<RemoteFunctions<T>>;
}

export const E: EProxy;
