/* eslint-disable no-use-before-define */
import { PASS_STYLE } from './passStyle-helpers.js';

/**
 * Matches any [primitive value](https://developer.mozilla.org/en-US/docs/Glossary/Primitive).
 */
export type Primitive =
  | null
  | undefined
  | string
  | number
  | boolean
  | symbol
  | bigint;

export type PrimitiveStyle =
  | 'undefined'
  | 'null'
  | 'boolean'
  | 'number'
  | 'bigint'
  | 'string'
  | 'symbol';

export type ContainerStyle = 'copyRecord' | 'copyArray' | 'tagged';

export type PassStyle =
  | PrimitiveStyle
  | ContainerStyle
  | 'remotable'
  | 'error'
  | 'promise';

export type TaggedOrRemotable = 'tagged' | 'remotable';

/**
 * Tagged has own [PASS_STYLE]: "tagged", [Symbol.toStringTag]: $tag.
 *
 * Remotable has a prototype chain in which the penultimate object has own [PASS_STYLE]: "remotable", [Symbol.toStringTag]: $iface (where both $tag and $iface must be strings, and the latter must either be "Remotable" or start with "Alleged: " or "DebugName: ").
 */
export type PassStyled<S extends TaggedOrRemotable, I extends InterfaceSpec> = {
  [PASS_STYLE]: S;
  [Symbol.toStringTag]: I;
};

export type ExtractStyle<P extends PassStyled<any, any>> = P[typeof PASS_STYLE];

export type PassByCopy =
  | Primitive
  | Error
  | CopyArray
  | CopyRecord
  | CopyTagged;

export type PassByRef =
  | RemotableObject
  | Promise<RemotableObject>
  | Promise<PassByCopy>;

/**
 * A Passable is acyclic data that can be marshalled. It must be hardened to
 * remain
 * stable (even if some components are proxies; see PureData restriction below),
 * and is classified by PassStyle:
 *   * Atomic primitive values have a PrimitiveStyle (PassStyle
 *     'undefined' | 'null' | 'boolean' | 'number' | 'bigint'
 *     | 'string' | 'symbol'). (Passable considers `void` to be `undefined`.)
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
  PC extends PassableCap = PassableCap,
  E extends Error = Error,
> = void | Primitive | Container<PC, E> | PC | E;

export type Container<PC extends PassableCap, E extends Error> =
  | CopyArrayCommon<PC, E>
  | CopyRecordCommon<PC, E>
  | CopyTaggedCommon<PC, E>;
interface CopyArrayCommon<PC extends PassableCap, E extends Error>
  extends CopyArray<Passable<PC, E>> {}
interface CopyRecordCommon<PC extends PassableCap, E extends Error>
  extends CopyRecord<Passable<PC, E>> {}
interface CopyTaggedCommon<PC extends PassableCap, E extends Error>
  extends CopyTagged<string, Passable<PC, E>> {}

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
  (p: any[]): 'copyArray';
  (p: Iterable<any>): 'remotable';
  (p: Iterator<any, any, undefined>): 'remotable';
  <T extends PassStyled<TaggedOrRemotable, any>>(p: T): ExtractStyle<T>;
  (p: { [key: string]: any }): 'copyRecord';
  (p: any): PassStyle;
};
/**
 * A Passable is PureData when its entire data structure is free of PassableCaps
 * (remotables and promises) and error objects.
 * PureData is an arbitrary composition of primitive values into CopyArray
 * and/or
 * CopyRecord and/or CopyTagged containers (or a single primitive value with no
 * container), and is fully pass-by-copy.
 *
 * This restriction assures absence of side effects and interleaving risks *given*
 * that none of the containers can be a Proxy instance.
 * TODO SECURITY BUG we plan to enforce this, giving PureData the same security
 * properties as the proposed
 * [Records and Tuples](https://github.com/tc39/proposal-record-tuple).
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
 * The authority-bearing leaves of a Passable's pass-by-copy superstructure.
 */
export type PassableCap = Promise<any> | RemotableObject;
/**
 * A Passable sequence of Passable values.
 */
export type CopyArray<T extends Passable = any> = Array<T>;

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
> = PassStyled<'tagged', Tag> & {
  payload: Payload;
};
/**
 * This is an interface specification.
 * For now, it is just a string, but we retain the option to make it `PureData`.
 * Either way, it must remain pure, so that it can be safely shared by subgraphs
 * that are not supposed to be able to communicate.
 */
export type InterfaceSpec = string;
/**
 * Internal to a useful pattern for writing checking logic
 * (a "checkFoo" function) that can be used to implement a predicate
 * (an "isFoo" function) or a validator (an "assertFoo" function).
 *
 *  * A predicate ideally only returns `true` or `false` and rarely throws.
 *  * A validator throws an informative diagnostic when the predicate
 *    would have returned `false`, and simply returns `undefined` normally
 *    when the predicate would have returned `true`.
 *  * The internal checking function that they share is parameterized by a
 *    `Checker` that determines how to proceed with a failure condition.
 *    Predicates pass in an identity function as checker. Validators
 *    pass in `assertChecker` which is a trivial wrapper around `assert`.
 *
 * See the various uses for good examples.
 */
export type Checker = (
  cond: boolean,
  details?: import('ses').Details | undefined,
) => boolean;
