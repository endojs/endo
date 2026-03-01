// @ts-check

/**
 * @import {RemotableMethodName} from '@endo/pass-style';
 * @import {InterfaceGuard, MethodGuard, ProseTemplate, LooseProseTemplate} from '@endo/patterns';
 */

/**
 * The name of the automatically added default meta-method for
 * obtaining an exo's interface guard, if it has one.
 *
 * Intended to be similar to `GET_METHOD_NAMES` from `@endo/pass-style`.
 *
 * See https://github.com/endojs/endo/pull/1809#discussion_r1388052454
 *
 * Beware that an exo's interface can change across an upgrade,
 * so remotes that cache it can become stale.
 */
export const GET_INTERFACE_GUARD = '__getInterfaceGuard__';

/**
 * The name of the automatically added default meta-method for
 * obtaining an exo's interface, if it has one.
 *
 * Intended to be similar to `GET_METHOD_NAMES` from `@endo/pass-style`.
 *
 * See https://github.com/endojs/endo/pull/1809#discussion_r1388052454
 *
 * Beware that an exo's interface can change across an upgrade,
 * so remotes that cache it can become stale.
 */
export const PERFORM = '__perform__';

/**
 * The name of the automatically added default meta-method for
 * obtaining an exo's interface, if it has one.
 *
 * Intended to be similar to `GET_METHOD_NAMES` from `@endo/pass-style`.
 *
 * See https://github.com/endojs/endo/pull/1809#discussion_r1388052454
 *
 * Beware that an exo's interface can change across an upgrade,
 * so remotes that cache it can become stale.
 */
export const PROSE_PERFORM = '__prosePerform__';

/**
 * @typedef {object} ProsePerformResult
 * @property {ProseTemplate} [resultTemplate]
 * @property {any} result
 *
 */

/**
 * @template {Record<RemotableMethodName, CallableFunction>} M
 * @typedef {{
 *   [GET_INTERFACE_GUARD]?: () =>
 *     InterfaceGuard<{ [K in keyof M]: MethodGuard }> | undefined;
 *   [PERFORM]?: (selector: string, ...args: any[]) => any;
 *   [PROSE_PERFORM]?: (performTemplate: LooseProseTemplate, ...args: any[]) =>
 *     ProsePerformResult;
 * }} MetaMethods
 */
