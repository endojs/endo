/** @import {RemoteKit} from '@endo/eventual-send' */
/** @import {ToCapData, FromCapData} from '@endo/marshal' */
/** @import {CapTPSlot, TrapHost, TrapGuest} from './types.js' */
/** @import {CapTPImportExportTables} from './captp-engine.js' */

import { makeCapTPEngine } from './captp-engine.js';

export { E } from '@endo/eventual-send';

/**
 * @typedef {object} CapTPOptions the options to makeCapTP
 * @property {(val: unknown, slot: CapTPSlot) => void} [exportHook]
 * @property {(val: unknown, slot: CapTPSlot) => void} [importHook]
 * @property {(err: any) => void} [onReject]
 * @property {number} [epoch] an integer tag to attach to all messages in order to
 * assist in ignoring earlier defunct instance's messages
 * @property {TrapGuest} [trapGuest] if specified, enable this CapTP (guest) to
 * use Trap(target) to block while the recipient (host) resolves and
 * communicates the response to the message
 * @property {TrapHost} [trapHost] if specified, enable this CapTP (host) to serve
 * objects marked with makeTrapHandler to synchronous clients (guests)
 * @property {boolean} [gcImports] if true, aggressively garbage collect imports
 * @property {(MakeCapTPImportExportTablesOptions) => CapTPImportExportTables} [makeCapTPImportExportTables] provide external import/export tables
 *
 * @typedef {object} CapTP
 * @property {((reason?: any) => void)} abort
 * @property {((obj: Record<string, any>) => void) | ((obj: Record<string, any>) => PromiseLike<void>)} dispatch
 * @property {() => Promise<any>} getBootstrap
 * @property {() => Record<string, Record<string, number>>} getStats
 * @property {(val: unknown) => boolean} isOnlyLocal
 * @property {ToCapData<string>} serialize
 * @property {FromCapData<string>} unserialize
 * @property {<T>(name: string, obj: T) => T} makeTrapHandler
 * @property {import('./ts-types.js').Trap | undefined} Trap
 * @property {((target: string) => RemoteKit)} makeRemoteKit
 */

/**
 * Create a CapTP connection.
 *
 * @param {string} ourId our name for the current side
 * @param {((obj: Record<string, any>) => void) | ((obj: Record<string, any>) => PromiseLike<void>)} rawSend send a JSONable packet
 * @param {any} bootstrapObj the object to export to the other side
 * @param {CapTPOptions} opts options to the connection
 * @returns {CapTP}
 */
export const makeCapTP = (
  ourId,
  rawSend,
  bootstrapObj = undefined,
  opts = {},
) => {
  return makeCapTPEngine(ourId, rawSend, bootstrapObj, opts);
};
