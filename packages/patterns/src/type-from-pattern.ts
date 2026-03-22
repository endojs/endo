/// <reference types="ses"/>
/* eslint-disable no-use-before-define */

import type {
  CopyArray,
  CopyRecord,
  CopyTagged,
  Passable,
  RemotableObject,
} from '@endo/pass-style';
import type { RemotableBrand } from '@endo/eventual-send';
import type {
  Key,
  MatcherNamespace,
  Pattern,
  ScalarKey,
  CopySet,
  CopyBag,
  CopyMap,
  InterfaceGuard,
  MethodGuard,
} from './types.js';

/**
 * Flatten an intersection into a single object type for cleaner IDE hovers.
 */
type Simplify<T> = { [K in keyof T]: T[K] } & {};

/**
 * Infer a static TypeScript type from a Pattern value.
 * Works like Zod's `z.infer<typeof schema>`.
 *
 * @example
 * ```ts
 * const shape = M.splitRecord({ name: M.string(), age: M.nat() });
 * type Person = TypeFromPattern<typeof shape>;
 * // { name: string; age: bigint }
 * ```
 */
export type TypeFromPattern<P> =
  P extends CopyTagged<`match:${infer K}`, infer Payload>
    ? TFDispatch<K, Payload>
    : P extends readonly [infer H, ...infer T]
      ? [TypeFromPattern<H>, ...TFTuple<T>]
      : P extends CopyRecord<any>
        ? Simplify<{ [K in keyof P]: TypeFromPattern<P[K]> }>
        : P;

// ===== Internal helpers =====

/** Recursively map a tuple of patterns to a tuple of inferred types. */
type TFTuple<T extends readonly any[]> = T extends readonly [
  infer H,
  ...infer R,
]
  ? [TypeFromPattern<H>, ...TFTuple<R>]
  : [];

/**
 * Leaf matcher lookup table.
 * These matchers return their Payload directly or a fixed type, with no
 * recursion into sub-patterns.  Using a mapped-type lookup keeps the
 * conditional-branch count low and avoids TS instantiation-depth limits
 * when TypeFromPattern recurses through mapped types (e.g. splitRecord).
 */
type TFLeafMap<Payload> = {
  any: Passable;
  string: Payload;
  number: Payload;
  bigint: Payload;
  nat: Payload;
  symbol: Payload;
  remotable: Payload;
  scalar: ScalarKey;
  key: Key;
  pattern: Pattern;
  not: Passable;
};

/** Maps PassStyle / Kind strings to their TypeScript value types. */
type TFKindMap = {
  boolean: boolean;
  undefined: undefined;
  null: null;
  error: Error;
  number: number;
  bigint: bigint;
  string: string;
  symbol: symbol;
  byteArray: ArrayBuffer;
  copyRecord: CopyRecord;
  copyArray: CopyArray;
  copySet: CopySet;
  copyBag: CopyBag;
  copyMap: CopyMap;
  remotable: RemotableObject | RemotableBrand<any, any>;
  promise: Promise<any>;
};

/**
 * Two-phase dispatch to avoid TS instantiation-depth limits.
 * Phase 1: O(1) lookup in the leaf table (no recursion).
 * Phase 2: conditional dispatch for structural / recursive matchers.
 */
type TFDispatch<K extends string, Payload> = K extends keyof TFLeafMap<Payload>
  ? TFLeafMap<Payload>[K]
  : TFStructural<K, Payload>;

/** Phase 2: structural / recursive matcher dispatch. */
type TFStructural<K extends string, Payload> = K extends 'kind'
  ? Payload extends keyof TFKindMap
    ? TFKindMap[Payload]
    : Passable
  : K extends 'promise'
    ? Promise<unknown extends Payload ? any : Payload>
    : K extends 'or'
      ? Payload extends readonly any[]
        ? TFOr<Payload>
        : Passable
      : K extends 'and'
        ? Payload extends readonly any[]
          ? TFAnd<Payload>
          : Passable
        : K extends 'arrayOf'
          ? Array<TypeFromPattern<Payload>>
          : K extends 'recordOf'
            ? Payload extends readonly [any, infer VP]
              ? Record<string, TypeFromPattern<VP>>
              : Record<string, any>
            : K extends 'mapOf'
              ? Payload extends readonly [infer KP, infer VP]
                ? CopyMap<
                    TypeFromPattern<KP> & Key,
                    TypeFromPattern<VP> & Passable
                  >
                : CopyMap
              : K extends 'splitRecord'
                ? Payload extends readonly [infer Req, infer Opt]
                  ? TFSplitRecord<Req, Opt>
                  : CopyRecord
                : K extends 'splitArray'
                  ? Payload extends readonly [infer Req, infer Opt]
                    ? TFSplitArray<Req, Opt>
                    : CopyArray
                  : Passable;

/** Union of inferred types from a tuple of patterns. */
type TFOr<T extends readonly any[]> = T extends readonly [infer H, ...infer R]
  ? TypeFromPattern<H> | TFOr<R>
  : never;

/** Intersection of inferred types from a tuple of patterns. */
type TFAnd<T extends readonly any[]> = T extends readonly [infer H, ...infer R]
  ? TypeFromPattern<H> & TFAnd<R>
  : unknown;

/** Infer a split record: required fields + optional fields. */
type TFSplitRecord<Req, Opt> = Simplify<
  (Req extends CopyRecord<any>
    ? { [K in keyof Req]: TypeFromPattern<Req[K]> }
    : {}) &
    (Opt extends CopyRecord<any>
      ? { [K in keyof Opt]?: TypeFromPattern<Opt[K]> }
      : {})
>;

/** Infer a split array: required tuple + optional trailing elements. */
type TFSplitArray<Req, Opt> = Req extends readonly any[]
  ? Opt extends readonly any[]
    ? [...TFTuple<Req>, ...TFOptionalTuple<Opt>]
    : TFTuple<Req>
  : any[];

/**
 * Map a tuple to elements that may be undefined (approximates optional).
 *
 * TS limitation: We cannot produce `[X?, Y?]` from a recursive conditional
 * type — `Partial<Tuple>` only works on concrete tuples.  For splitArray
 * optional elements we use `T | undefined` instead, meaning the array
 * must still be the full length.  If TS gains support for producing truly
 * optional tuple elements from conditional types, this should be revised.
 */
type TFOptionalTuple<T extends readonly any[]> = T extends readonly [
  infer H,
  ...infer R,
]
  ? [TypeFromPattern<H> | undefined, ...TFOptionalTuple<R>]
  : [];

// ===== Method and Interface Guard inference =====

/**
 * Infer the TypeScript type of a single argument guard.
 * - `RawGuard` → `any` (no checking)
 * - `AwaitArgGuard<P>` → the inferred type of the inner pattern P
 * - Any other `Pattern` → `TypeFromPattern<P>`
 */
type TypeFromArgGuard<G> = G extends { [Symbol.toStringTag]: 'guard:rawGuard' }
  ? any
  : G extends { payload: { argGuard: infer P } }
    ? TypeFromPattern<P>
    : TypeFromPattern<G>;

/** Map a tuple of arg guards to a tuple of inferred types. */
type TFArgGuards<T extends readonly any[]> = T extends readonly [
  infer H,
  ...infer R,
]
  ? [TypeFromArgGuard<H>, ...TFArgGuards<R>]
  : [];

/**
 * Map a tuple of arg guards to inferred types, then make all optional.
 * Uses Partial<Tuple> which produces `[X?, Y?]` (truly optional elements).
 */
type TFOptArgGuards<T extends readonly any[]> = Partial<TFArgGuards<T>>;

/** Infer return type from a return guard. */
type TypeFromReturnGuard<G> = G extends {
  [Symbol.toStringTag]: 'guard:rawGuard';
}
  ? any
  : TypeFromPattern<G>;

/**
 * Infer a function signature from a `MethodGuard`.
 *
 * @example
 * ```ts
 * const mg = M.call(M.string(), M.nat()).returns(M.boolean());
 * type Fn = TypeFromMethodGuard<typeof mg>;
 * // (arg0: string, arg1: bigint) => boolean
 * ```
 */
export type TypeFromMethodGuard<G> = G extends {
  payload: {
    callKind: infer CK;
    argGuards: infer Args extends readonly any[];
    optionalArgGuards?: infer OptArgs extends readonly any[];
    returnGuard: infer Ret;
  };
}
  ? OptArgs extends readonly any[]
    ? CK extends 'async'
      ? (
          ...args: [...TFArgGuards<Args>, ...TFOptArgGuards<OptArgs>]
        ) => Promise<TypeFromReturnGuard<Ret>>
      : (
          ...args: [...TFArgGuards<Args>, ...TFOptArgGuards<OptArgs>]
        ) => TypeFromReturnGuard<Ret>
    : CK extends 'async'
      ? (...args: TFArgGuards<Args>) => Promise<TypeFromReturnGuard<Ret>>
      : (...args: TFArgGuards<Args>) => TypeFromReturnGuard<Ret>
  : (...args: any[]) => any;

/**
 * Infer a methods record from an `InterfaceGuard`.
 *
 * @example
 * ```ts
 * const FooI = M.interface('Foo', {
 *   bar: M.call(M.string()).returns(M.nat()),
 * });
 * type FooMethods = TypeFromInterfaceGuard<typeof FooI>;
 * // { bar: (arg0: string) => bigint }
 * ```
 */
export type TypeFromInterfaceGuard<G> =
  G extends InterfaceGuard<infer MG>
    ? { [K in keyof MG]: TypeFromMethodGuard<MG[K]> }
    : Record<string, (...args: any[]) => any>;

// ===== Value + namespace declarations for re-export =====
//
// These declarations are re-exported by types-index.d.ts to provide
// enhanced type signatures that JSDoc cannot express:
// - M: value + namespace merge for M.infer<typeof pattern>
// - matches: type predicate for narrowing in if-blocks
// - mustMatch: asserts signature for narrowing after call
//
// The runtime implementations live in patternMatchers.js and are
// re-exported by types-index.js.  These declarations overlay the
// runtime types so that consumers get type-narrowing for free.

/** The `M` pattern-matcher namespace value. */
// eslint-disable-next-line import/export
export declare const M: MatcherNamespace;

/**
 * Namespace merged with the `M` value export so users can write
 * `M.infer<typeof pattern>`, analogous to Zod's `z.infer<typeof schema>`.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace, no-redeclare, import/export
export namespace M {
  /**
   * Infer the TypeScript type that a Pattern matches.
   *
   * @example
   * ```ts
   * const shape = M.splitRecord({ name: M.string(), age: M.nat() });
   * type Person = M.infer<typeof shape>;
   * // { name: string; age: bigint }
   * ```
   */
  export type infer<P> = TypeFromPattern<P>;
}

/**
 * Type-narrowing `matches`: narrows `specimen` in if-blocks.
 *
 * @param specimen - The value to test.
 * @param patt - The pattern to match against.
 *
 * @example
 * ```ts
 * if (matches(value, M.string())) {
 *   value; // narrowed to string
 * }
 * ```
 */
export declare function matches<P extends Pattern>(
  specimen: any,
  patt: P,
): specimen is TypeFromPattern<P>;

/**
 * Type-narrowing `mustMatch`: narrows `specimen` after the call.
 * Throws if the specimen does not match.
 *
 * @param specimen - The value to test.
 * @param patt - The pattern to match against.
 * @param [label] - Optional label for error messages.
 *
 * @example
 * ```ts
 * mustMatch(value, M.string());
 * value; // narrowed to string
 * ```
 */
export declare function mustMatch<P extends Pattern>(
  specimen: any,
  patt: P,
  label?: string | number,
): asserts specimen is TypeFromPattern<P>;
