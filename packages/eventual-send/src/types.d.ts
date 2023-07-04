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

export type Callable = (...args: unknown[]) => any;

/**
 * Nominal type to carry the local and remote interfaces of a Remotable.
 */
export declare class RemotableBrand<Local, Remote> {
  /** The local properties of the object. */
  private L: Local;

  /** The type of all the remotely-callable functions. */
  private R: Remote;
}
