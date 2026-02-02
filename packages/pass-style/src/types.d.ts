import type { RemotableBrand } from '@endo/eventual-send';
/* eslint-disable no-use-before-define */
import { PASS_STYLE } from './passStyle-helpers.js';

/**
 * JS values that correspond to ocapn Atoms, most of which are JS primitives,
 * but some of which are represented as JS object.
 */
export type Atom =
  | undefined
  | null
  | boolean
  | number
  | bigint
  | string
  | ByteArray
  | symbol;

export type AtomStyle =
  | 'undefined'
  | 'null'
  | 'boolean'
  | 'number'
  | 'bigint'
  | 'string'
  | 'byteArray'
  | 'symbol';

/**
 * The actual JS primitive types.
 */
export type JSPrimitive =
  | undefined
  | null
  | boolean
  | number
  | bigint
  | string
  | symbol;

/**
 * @deprecated Use `Atom` instead, which is also the ocapn name. Now that
 * ByteArray has been added, this category no longer corresponds to
 * JS primitives, We also expect to move  to a passable-symbol representation
 * as a JS object, not a JS primitive. But if you really do mean a JS primitive
 * only, use `JSPrimitive` instead.
 */
export type Primitive = Atom;

/**
 * @deprecated Use `AtomStyle` instead. See `Atom` vs `Primitive`.
 */
export type PrimitiveStyle = AtomStyle;

export type ContainerStyle = 'copyRecord' | 'copyArray' | 'tagged';

export type PassStyle =
  | AtomStyle
  | ContainerStyle
  | 'remotable'
  | 'error'
  | 'promise';

export type PassStyleMarker = 'tagged' | 'remotable';

/**
 * Tagged has own [PASS_STYLE]: "tagged", [Symbol.toStringTag]: $tag.
 *
 * Remotable has a prototype chain in which the penultimate object has own [PASS_STYLE]: "remotable", [Symbol.toStringTag]: $iface (where both $tag and $iface must be strings, and the latter must either be "Remotable" or start with "Alleged: " or "DebugName: ").
 */
export type PassStyled<S extends PassStyleMarker, I extends InterfaceSpec> = {
  [PASS_STYLE]: S;
  [Symbol.toStringTag]: I;
};

export type ExtractStyle<P extends PassStyled<any, any>> = P[typeof PASS_STYLE];

export type PassByCopy = Atom | Error | CopyArray | CopyRecord | CopyTagged;

export type PassByRef =
  | RemotableObject
  | RemotableBrand<any, any>
  | Promise<Passable>;

/**
 * A Passable is acyclic data that can be marshalled. It must be hardened to
 * remain
 * stable (even if some components are proxies; see PureData restriction below),
 * and is classified by PassStyle:
 *   * Atomic values have an AtomStyle (PassStyle
 *     'undefined' | 'null' | 'boolean' | 'number' | 'bigint'
 *     | 'string' | 'byteArray' | 'symbol').
 *     (Passable considers `void` to be `undefined`.)
 *   * Containers aggregate other Passables into
 *     * sequences as CopyArrays (PassStyle 'copyArray'), or
 *     * string-keyed dictionaries as CopyRecords (PassStyle 'copyRecord'), or
 *     * higher-level types as CopyTaggeds (PassStyle 'tagged').
 *   * PassableCaps (PassStyle 'remotable' | 'promise') expose local values to
 *     remote interaction.
 *   * As a special case to support system observability, error objects are
 *     Passable (PassStyle 'error').
 *
 * A Passable is essentially a pass-by-copy superstructure with a
 * pass-by-reference
 * exit point at the site of each PassableCap (which marshalling represents
 * using 'slots').
 */
export type Passable<
  /**
   * Promises are now explicitly part of the Passable types, so the PC
   * parameter is only here for backward compatibility for limiting the
   * non-promise PassableCaps.
   */
  PC extends AwaitedPassableCap = AwaitedPassableCap,
  /**
   * E was initially just Error (non-keys) or never (keys), now we use it more
   * generally to indicate when the Passable is allowed to contain Promises as
   * well (never still means keys).
   */
  E extends Error | Promise<unknown> = Error | Promise<unknown>,
> =
  | AwaitedPassable<PC, E>
  | (E extends Promise<unknown> ? Promise<AwaitedPassable<PC, E>> : never);

/**
 * An AwaitedPassable is the non-Promise parts of Passable.
 */
export type AwaitedPassable<
  PC extends AwaitedPassableCap = AwaitedPassableCap,
  E extends Error | Promise<any> = Error | Promise<any>,
> = void | Atom | Container<PC, E> | PC | Exclude<E, Promise<any>>;

export type Container<PC extends AwaitedPassableCap, E extends Error | Promise<any>> =
  | CopyArrayInterface<PC, E>
  | CopyRecordInterface<PC, E>
  | CopyTaggedInterface<PC, E>;
export interface CopyArrayInterface<PC extends AwaitedPassableCap, E extends Error | Promise<any>>
  extends CopyArray<Passable<PC, E>> {}
export interface CopyRecordInterface<
  PC extends AwaitedPassableCap,
  E extends Error | Promise<any>,
> extends CopyRecord<Passable<PC, E>> {}
export interface CopyTaggedInterface<
  PC extends AwaitedPassableCap,
  E extends Error | Promise<any>,
> extends CopyTagged<string, Passable<PC, E>> {}

export type PassStyleOf = {
  (p: undefined): 'undefined';
  (p: string): 'string';
  (p: boolean): 'boolean';
  (p: number): 'number';
  (p: bigint): 'bigint';
  (p: symbol): 'symbol';
  (p: null): 'null';
  (p: Promise<any>): 'promise';
  (p: Error): 'error';
  (p: CopyTagged): 'tagged';
  (p: readonly any[]): 'copyArray';
  (p: Iterable<any>): 'remotable';
  (p: Iterator<any, any, undefined>): 'remotable';
  <T extends PassStyled<PassStyleMarker, any>>(p: T): ExtractStyle<T>;
  (p: { [key: string]: any }): 'copyRecord';
  (p: unknown): never;
  (p: any): PassStyle;
};

/**
 * A Passable is PureData when its entire data structure is free of PassableCaps
 * (remotables and promises) and error objects.
 * PureData is an arbitrary composition of Atoms into CopyArray,
 * CopyRecord, and/or CopyTagged containers
 * (or a single Atom with no container), and is fully pass-by-copy.
 *
 * This restriction assures absence of side effects and interleaving risks
 * *given* that none of the containers can be a Proxy instance.
 * TODO SECURITY BUG we plan to enforce this, giving PureData the same security
 * properties as the proposed
 * [Records and Tuples](https://github.com/tc39/proposal-record-tuple).
 * (TODO update to point at the non-trapping shim)
 *
 * Given this (currently counter-factual) assumption, a PureData value cannot
 * be used as a communications channel,
 * and can therefore be safely shared with subgraphs that should not be able
 * to communicate with each other.
 * Without that assumption, such a guarantee requires a marshal-unmarshal round
 * trip (as exists between vats) to produce data structures disconnected from
 * any potential proxies.
 */
export type PureData = Passable<never, never>;

/**
 * @deprecated this type doesn't carry the type of the behavior for remote
 * sends. You likely want to use {@link RemotableBrand} instead.
 *
 * An object marked as remotely accessible using the `Far` or `Remotable`
 * functions, or a local presence representing such a remote object.
 *
 * A more natural name would be Remotable, but that could be confused with the
 * value of the `Remotable` export of this module (a function).
 */
export type RemotableObject<I extends InterfaceSpec = string> = PassStyled<
  'remotable',
  I
>;

/**
 * Abstract remotable method names to its own type in preparation of
 * restricting it in a later PR.
 */
// TODO https://github.com/endojs/endo/issues/2884#issuecomment-3063896482
// Restrict this type, and to use this restricted type rather than `PropertyKey`
// to type method names of Remotables.
// export type RemotableMethodName = string | symbol;
export type RemotableMethodName = PropertyKey;

/**
 * The authority-bearing leaves of a Passable's pass-by-copy superstructure.
 */
export type PassableCap = AwaitedPassableCap | Promise<Passable>;

/**
 * The non-promise authority-bearing leaves of a Passable's pass-by-copy
 * superstructure.
 */
export type AwaitedPassableCap = RemotableObject | RemotableBrand<any, any>;

/**
 * A Passable sequence of Passable values.
 */
export type CopyArray<T extends Passable = any> = ReadonlyArray<T>;

/**
 * A hardened immutable ArrayBuffer.
 */
export type ByteArray = ArrayBuffer;

/**
 * A Passable dictionary in which each key is a string and each value is Passable.
 */
export type CopyRecord<T extends Passable = any> = Record<string, T>;

/**
 * A Passable "tagged record" with semantics specific to the tag identified in
 * the `[Symbol.toStringTag]` property (such as 'copySet', 'copyBag',
 * or 'copyMap').
 * It must have a property with key equal to the `PASS_STYLE` export and
 * value 'tagged'
 * and no other properties except `[Symbol.toStringTag]` and `payload`.
 */
export type CopyTagged<
  Tag extends string = string,
  Payload extends Passable = any,
> = PassStyled<'tagged', Tag> & { payload: Payload };

/**
 * This is an interface specification.
 * For now, it is just a string, but we retain the option to make it `PureData`.
 * Either way, it must remain pure, so that it can be safely shared by subgraphs
 * that are not supposed to be able to communicate.
 */
export type InterfaceSpec = string;

/**
 * Consider this export deprecated.
 * Import `Checker` directly from `'@endo/common/ident-checker.js'` instead.
 */
export type { Checker } from '@endo/common/ident-checker.js';
