// @ts-check

/**
 * The name of the automatically added default meta-method for
 * obtaining an exo's interface, if it has one.
 *
 * Intended to be similar to `GET_METHOD_NAMES` from `@endo/pass-style`.
 *
 * TODO Name to be bikeshed. Perhaps even whether it is a
 * string or symbol to be bikeshed. See
 * https://github.com/endojs/endo/pull/1809#discussion_r1388052454
 *
 * TODO Beware that an exo's interface can change across an upgrade,
 * so remotes that cache it can become stale.
 */
export const GET_INTERFACE_GUARD = '__getInterfaceGuard__';

/**
 * @template {Record<PropertyKey, CallableFunction>} M
 * @typedef {{
 *   [GET_INTERFACE_GUARD]: () =>
 *     import('@endo/patterns').InterfaceGuard<{
 *       [K in keyof M]: import('@endo/patterns').MethodGuard
 *     }> | undefined
 * }} GetInterfaceGuard
 */
