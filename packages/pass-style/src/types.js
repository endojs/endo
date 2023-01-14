export {};

/**
 * @typedef { "undefined" | "null" |
 *   "boolean" | "number" | "bigint" | "string" | "symbol"
 * } PrimitiveStyle
 */

/**
 * @typedef { PrimitiveStyle |
 *   "copyRecord" | "copyArray" | "tagged" |
 *   "remotable" |
 *   "error" | "promise"
 * } PassStyle
 */

// TODO declare more precise types throughout this file, so the type system
// and IDE can be more helpful.

/**
 * @typedef {*} Passable
 *
 * A Passable value that may be marshalled. It is classified as one of
 * PassStyle. A Passable must be hardened.
 *
 * A Passable has a pass-by-copy superstructure. This includes
 *    * the atomic pass-by-copy primitives ("undefined" | "null" |
 *      "boolean" | "number" | "bigint" | "string" | "symbol"),
 *    * the pass-by-copy containers
 *      ("copyRecord" | "copyArray" | "tagged") that
 *      contain other Passables,
 *    * and the special cases ("error" | "promise").
 *
 * A Passable's pass-by-copy superstructure ends in
 * PassableCap leafs ("remotable" | "promise"). Since a
 * Passable is hardened, its structure and classification is stable --- its
 * structure and classification cannot change even if some of the objects are
 * proxies.
 */

/**
 * @callback PassStyleOf
 * @param {Passable} passable
 * @returns {PassStyle}
 */

/**
 * @typedef {Passable} PureData
 *
 * A Passable is PureData when its pass-by-copy superstructure whose
 * nodes are pass-by-copy composites (CopyArray, CopyRecord, Tagged) leaves are
 * primitives or empty composites. No remotables, promises, or errors.
 *
 * This check assures purity *given* that none of these pass-by-copy composites
 * can be a Proxy. TODO SECURITY BUG we plan to enforce this, giving these
 * pass-by-copy composites much of the same security properties as the
 * proposed Records and Tuples (TODO need link).
 *
 * Given this (currently counter-factual) assumption, a PureData value cannot
 * be used as a communications channel,
 * and can therefore be safely shared with subgraphs that should not be able
 * to communicate with each other.
 */

/**
 * @typedef {Passable} Remotable
 * Might be an object explicitly declared to be `Remotable` using the
 * `Far` or `Remotable` functions, or a remote presence of a Remotable.
 */

/**
 * @typedef {Promise | Remotable} PassableCap
 * The authority-bearing leaves of a Passable's pass-by-copy superstructure.
 */

/**
 * @template T
 * @typedef {T[]} CopyArray
 */

/**
 * @template T
 * @typedef {Record<string, T>} CopyRecord
 */

/**
 * @typedef {{
 *   [Symbol.toStringTag]: string,
 *   payload: Passable
 * }} CopyTagged
 *
 * The tag is the value of the `[String.toStringTag]` property.
 *
 * We used to also declare
 * ```js
 * [PASS_STYLE]: 'tagged',
 * ```
 * within the CopyTagged type, before we extracted the pass-style package
 * from the marshal package. Within pass-style, this additional property
 * declaration seemed to be ignored by TS, but at least TS was still not
 * complaining. However, TS checking the marshal package complains about
 * this line because it does not know what `PASS_STYLE` is. I could not
 * figure out how to fix this.
 */

/**
 * @typedef {string} InterfaceSpec
 * This is an interface specification.
 * For now, it is just a string, but will eventually be `PureData`. Either
 * way, it must remain pure, so that it can be safely shared by subgraphs that
 * are not supposed to be able to communicate.
 */

/**
 * @callback MarshalGetInterfaceOf
 * Simple semantics, just tell what interface (or undefined) a remotable has.
 * @param {*} maybeRemotable the value to check
 * @returns {InterfaceSpec|undefined} the interface specification, or undefined
 * if not a deemed to be a Remotable
 */

/**
 * @callback Checker
 * Internal to a useful pattern for writing checking logic
 * (a "checkFoo" function) that can be used to implement a predicate
 * (an "isFoo" function) or a validator (an "assertFoo" function).
 *
 *    * A predicate ideally only returns `true` or `false` and rarely throws.
 *    * A validator throws an informative diagnostic when the predicate
 *      would have returned `false`, and simply returns `undefined` normally
 *      when the predicate would have returned `true`.
 *    * The internal checking function that they share is parameterized by a
 *      `Checker` that determines how to proceed with a failure condition.
 *      Predicates pass in an identity function as checker. Validators
 *      pass in `assertChecker` which is a trivial wrapper around `assert`.
 *
 * See the various uses for good examples.
 * @param {boolean} cond
 * @param {Details=} details
 * @returns {boolean}
 */
