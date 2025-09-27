/* eslint-disable import/export */

// Module Types //////////////////////////////////////////////////////
//
//   Types exposed from modules.
//

// @ts-ignore TS1383: Only named exports may use 'export type'.
export type * from './E.js';
// @ts-ignore TS1383: Only named exports may use 'export type'.
export type * from './handled-promise.js';
// @ts-ignore TS1383: Only named exports may use 'export type'.
export type * from './track-turns.js';

// Utility Types /////////////////////////////////////////////////////
//
//   Types exposed to modules.
//

export type Callable = (...args: any[]) => any;

// TODO(https://github.com/endojs/endo/issues/2979): We likely want to merge
// the RemotableObject symbol shape into this type to reduce confusion about
// why both exist, but all kinds of things blow up when trying to do that.

/**
 * Nominal type to carry the local and remote interfaces of a Remotable.
 *
 * Note: this type does not currently include the structural aspect of the
 * {@link RemotableObject} type, and as such is not suitable to represent a
 * "remotable" for APIs that expect an object with a pass-style symbol.
 */
export declare class RemotableBrand<Local, Remote> {
  /** The local properties of the object. */
  private L: Local;

  /** The type of all the remotely-callable functions. */
  private R: Remote;
}
