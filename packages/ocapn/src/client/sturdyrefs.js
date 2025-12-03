// @ts-check

/**
 * @import { OcapnLocation } from '../codecs/components.js'
 * @import { Session } from './types.js'
 */

import { E } from '@endo/eventual-send';

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

  /**
   * @param {(location: OcapnLocation) => Promise<Session>} provideSession
   * @param {OcapnLocation} location
   * @param {Uint8Array} swissNum
   */
  constructor(provideSession, location, swissNum) {
    this.#provideSession = provideSession;
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
 */

/**
 * Create a SturdyRef tracker
 * @param {(location: OcapnLocation) => Promise<Session>} provideSession
 * @returns {SturdyRefTracker}
 */
export const makeSturdyRefTracker = provideSession => {
  return harden({
    /**
     * @param {OcapnLocation} location
     * @param {Uint8Array} swissNum
     * @returns {SturdyRef}
     */
    makeSturdyRef: (location, swissNum) => {
      return harden(new SturdyRef(provideSession, location, swissNum));
    },
  });
};
