export { E } from "@endo/eventual-send";
/**
 * Declare an object that is potentially a far reference of type Primary whose
 * auxilliary data has type Local.  This should be used only for consumers of
 * Far objects in arguments and declarations; the only creators of Far objects
 * are distributed object creator components like the `Far` or `Remotable`
 * functions.
 */
export type FarRef<Primary, Local = import("@endo/eventual-send").DataOnly<Primary>> = import('@endo/eventual-send').FarRef<Primary, Local>;
/**
 * Declare that `T` may or may not be a Promise.  This should be used only for
 * consumers of arguments and declarations; return values should specifically be
 * `Promise<T>` or `T` itself.
 */
export type ERef<T> = import('@endo/eventual-send').ERef<T>;
/**
 * Declare a near object that must only be invoked with E, even locally.  It
 * supports the `T` interface but additionally permits `T`'s methods to return
 * `PromiseLike`s even if `T` declares them as only synchronous.
 */
export type EOnly<T> = import('@endo/eventual-send').EOnly<T>;
export { Far, getInterfaceOf, passStyleOf } from "@endo/pass-style";
//# sourceMappingURL=index.d.ts.map