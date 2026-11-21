/**
 * @import {ByteArray, Remotable} from '@endo/pass-style';
 */

/**
 * @template N
 * @template R
 * @typedef {object} Builder
 * For recognizing or building accoording to OCapN abstract syntax / data model.
 * See https://github.com/ocapn/ocapn/blob/main/draft-specifications/Model.md
 * This API uses those OCapN names for the build methods, but uses the
 * correponding JS types for the argument types.
 * (Except `buildRoot` which is at a Builder metalevel.)
 *
 * Based on "The Event-Based DEBuilder API" at
 * http://www.erights.org/data/serial/jhu-paper/data-e-manual.html
 * See also "./call-grammar.md".
 *
 * @property {(buildTopFn: () => N) => R} buildRoot
 *
 * // Atoms
 * @property {() => N} buildUndefined
 * @property {() => N} buildNull
 * @property {(flag: boolean) => N} buildBoolean
 * @property {(bigint: bigint) => N} buildInteger
 * @property {(num: number) => N} buildFloat64
 * @property {(str: string) => N} buildString
 * @property {(byteArray: ByteArray) => N} buildByteArray
 * TODO implement in all builders
 * @property {(sym: symbol) => N} buildSymbol
 *
 * // Containers
 * @property {(names: string[], buildValuesIter: Iterable<N>) => N} buildStruct
 * The recognizer must pass the actual property names through. It is
 * up to the builder whether it wants to encode them.
 * It is up to the recognizer to sort the entries by their actual
 * property name first, and to encode their values in the resulting
 * sorted order. The builder may assume that sorted order.
 * @property {(count: number, buildElementsIter: Iterable<N>) => N} buildList
 * @property {(tagName: string, buildPayloadFn: () => N) => N} buildTagged
 * The recognizer must pass the actual tagName through. It is
 * up to the builder whether it wants to encode it.
 *
 * // References
 * @property {(remotable: Remotable) => N} buildTarget
 * @property {(promise: Promise) => N} buildPromise
 *
 * // Errors
 * @property {(error :Error) => N} buildError
 */

/**
 * @template E
 * @template N
 * @template R
 * @callback Recognize
 * @param {E} encoding
 * @param {Builder<N,R>} builder
 * @returns {R}
 */
