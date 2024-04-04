export function Remotable<T extends {}>(iface?: string | undefined, props?: undefined, remotable?: T | undefined): T & import("@endo/eventual-send").RemotableBrand<{}, T>;
/**
 * The name of the automatically added default meta-method for obtaining a
 * list of all methods of an object declared with `Far`, or an object that
 * inherits from an object declared with `Far`.
 *
 * Modeled on `GET_INTERFACE_GUARD` from `@endo/exo`.
 *
 * TODO Name to be bikeshed. Perhaps even whether it is a
 * string or symbol to be bikeshed. See
 * https://github.com/endojs/endo/pull/1809#discussion_r1388052454
 *
 * HAZARD: Beware that an exo's interface can change across an upgrade,
 * so remotes that cache it can become stale.
 */
export const GET_METHOD_NAMES: "__getMethodNames__";
export function Far<T extends {}>(farName: string, remotable?: T | undefined): T & import("@endo/eventual-send").RemotableBrand<{}, T>;
export function ToFarFunction(farName: string, func: (...args: any[]) => any): (...args: any[]) => any;
export type RemotableBrand<L, R> = import('@endo/eventual-send').RemotableBrand<L, R>;
//# sourceMappingURL=make-far.d.ts.map