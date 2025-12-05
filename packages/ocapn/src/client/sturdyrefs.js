// @ts-check

/**
 * @import { OcapnLocation } from '../codecs/components.js'
 * @import { Session } from './types.js'
 */

import { E } from '@endo/eventual-send';
import { decodeSwissnum } from './util.js';

/**
 * @typedef {object} SturdyRefDetails
 * @property {OcapnLocation} location
 * @property {Uint8Array} swissNum
 */

// WeakMap to store SturdyRef details (internal to this module)
/** @type {WeakMap<SturdyRef, SturdyRefDetails>} */
const sturdyRefDetails = new WeakMap();

/**
 * SturdyRef class - represents an unenlivened reference to a remote object
 */
export class SturdyRef {
  #provideSession;

  #isSelfLocation;

  #swissnumTable;

  /**
   * @param {(location: OcapnLocation) => Promise<Session>} provideSession
   * @param {(location: OcapnLocation) => boolean} isSelfLocation
   * @param {Map<string, any>} swissnumTable
   * @param {OcapnLocation} location
   * @param {Uint8Array} swissNum
   */
  constructor(
    provideSession,
    isSelfLocation,
    swissnumTable,
    location,
    swissNum,
  ) {
    this.#provideSession = provideSession;
    this.#isSelfLocation = isSelfLocation;
    this.#swissnumTable = swissnumTable;
    // Store details in the module-private WeakMap
    sturdyRefDetails.set(this, { location, swissNum });
  }

  /**
   * Enliven the SturdyRef by fetching the actual object
   * @returns {Promise<any>}
   */
  async enliven() {
    const details = sturdyRefDetails.get(this);
    if (!details) {
      throw Error('SturdyRef details not found');
    }
    const { location, swissNum } = details;

    // Special case: if this is a self-location, return the object directly
    if (this.#isSelfLocation(location)) {
      const swissStr = decodeSwissnum(swissNum);
      const object = this.#swissnumTable.get(swissStr);
      if (!object) {
        throw Error(`Local fetch: Unknown swissnum for sturdyref: ${swissStr}`);
      }
      return object;
    }

    // Otherwise, fetch from remote location via session
    const { ocapn } = await this.#provideSession(location);
    return E(ocapn.getBootstrap()).fetch(swissNum);
  }
}

// Harden the class
harden(SturdyRef);
harden(SturdyRef.prototype);

/**
 * Check if a value is a SturdyRef
 * @param {any} value
 * @returns {boolean}
 */
export const isSturdyRef = value => {
  return value instanceof SturdyRef;
};

/**
 * Get SturdyRef details (for internal system use only)
 * @param {SturdyRef} sturdyRef
 * @returns {SturdyRefDetails | undefined}
 */
export const getSturdyRefDetails = sturdyRef => {
  return sturdyRefDetails.get(sturdyRef);
};

/**
 * @typedef {object} SturdyRefTracker
 * @property {(location: OcapnLocation, swissNum: Uint8Array) => SturdyRef} makeSturdyRef
 * @property {(swissNum: Uint8Array) => any | undefined} lookup - Look up an object by swissnum
 * @property {(swissStr: string, object: any) => void} register - Register an object with a swissnum string
 */

/**
 * Create a SturdyRef tracker
 * @param {(location: OcapnLocation) => Promise<Session>} provideSession
 * @param {(location: OcapnLocation) => boolean} isSelfLocation
 * @param {Map<string, any>} swissnumTable
 * @returns {SturdyRefTracker}
 */
export const makeSturdyRefTracker = (
  provideSession,
  isSelfLocation,
  swissnumTable,
) => {
  return harden({
    /**
     * @param {OcapnLocation} location
     * @param {Uint8Array} swissNum
     * @returns {SturdyRef}
     */
    makeSturdyRef: (location, swissNum) => {
      return harden(
        new SturdyRef(
          provideSession,
          isSelfLocation,
          swissnumTable,
          location,
          swissNum,
        ),
      );
    },
    /**
     * Look up an object by swissnum
     * @param {Uint8Array} swissNum
     * @returns {any | undefined}
     */
    lookup: swissNum => {
      const swissStr = decodeSwissnum(swissNum);
      return swissnumTable.get(swissStr);
    },
    /**
     * Register an object with a swissnum string
     * @param {string} swissStr
     * @param {any} object
     */
    register: (swissStr, object) => {
      swissnumTable.set(swissStr, object);
    },
  });
};
