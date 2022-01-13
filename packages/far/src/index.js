export { E } from '@agoric/eventual-send';
export { Far, getInterfaceOf, passStyleOf } from '@agoric/marshal';

/**
 * @template T
 * @typedef {import('@agoric/eventual-send').ERef<T>} ERef
 * Declare that `T` can be either a near or far reference.  This should be used
 * only for arguments and declarations; return values should specifically be
 * `Promise<T>` or `T` itself.
 */

/**
 * @template T
 * @typedef {import('@agoric/eventual-send').EOnly<T>} EOnly
 * A type that must only be invoked with E.  It supports the `T` interface
 * interface but additionally permits functions to return `PromiseLike`s even if
 * `T` declares them as only synchronous.
 */
