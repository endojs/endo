// @ts-check

/**
 * @import { OcapnLocation } from '../codecs/components.js'
 * @import { Session, SwissNum } from './types.js'
 */

import { E } from '@endo/eventual-send';
import { makeTagged } from '@endo/pass-style';
import { decodeSwissnum } from './util.js';

/**
 * @import { CopyTagged } from '@endo/pass-style'
 * @typedef {CopyTagged<'ocapn-sturdyref', undefined>} SturdyRef
 * A SturdyRef is tentatively reified as a tagged value with tag 'ocapn-sturdyref' and undefined payload.
 * This is a workaround for sturdyref lacking passStyleOf compatibility. A tag type was chosen
 * so it is clearly labeled as a sturdyref, but should never be sent over the wire as a tagged value.
 *
 * @typedef {object} SturdyRefDetails
 * @property {OcapnLocation} location
 * @property {SwissNum} swissNum
 */

// WeakMap to store SturdyRef details (internal to this module)
/** @type {WeakMap<SturdyRef, SturdyRefDetails>} */
const sturdyRefDetails = new WeakMap();

/**
 * Check if a value is a SturdyRef by checking if it's in the WeakMap
 * @param {any} value
 * @returns {boolean}
 */
export const isSturdyRef = value => {
  return sturdyRefDetails.has(value);
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
 * Enliven a SturdyRef by fetching the actual object
 * @param {SturdyRef} sturdyRef
 * @param {(location: OcapnLocation) => Promise<Session>} provideSession
 * @param {(location: OcapnLocation) => boolean} isSelfLocation
 * @param {Map<string, any>} swissnumTable
 * @returns {Promise<any>}
 */
export const enlivenSturdyRef = async (
  sturdyRef,
  provideSession,
  isSelfLocation,
  swissnumTable,
) => {
  const details = sturdyRefDetails.get(sturdyRef);
  if (!details) {
    throw Error('SturdyRef details not found');
  }
  const { location, swissNum } = details;

  // Special case: if this is a self-location, return the object directly
  if (isSelfLocation(location)) {
    const swissStr = decodeSwissnum(swissNum);
    const object = swissnumTable.get(swissStr);
    if (!object) {
      throw Error(`Local fetch: Unknown swissnum for sturdyref: ${swissStr}`);
    }
    return object;
  }

  // Otherwise, fetch from remote location via session
  const { ocapn } = await provideSession(location);
  const bootstrap =
    /** @type {{ fetch: (swissNum: SwissNum) => Promise<unknown> }} */ (
      ocapn.getRemoteBootstrap()
    );
  return E(bootstrap).fetch(swissNum);
};

/**
 * @typedef {object} SturdyRefTracker
 * @property {(location: OcapnLocation, swissNum: SwissNum) => SturdyRef} makeSturdyRef
 * @property {(swissNum: SwissNum) => any | undefined} lookup - Look up an object by swissnum
 * @property {(swissStr: string, object: any) => void} register - Register an object with a swissnum string
 */

/**
 * Create a SturdyRef tracker
 * @param {Map<string, any>} swissnumTable
 * @returns {SturdyRefTracker}
 */
export const makeSturdyRefTracker = swissnumTable => {
  return harden({
    /**
     * @param {OcapnLocation} location
     * @param {SwissNum} swissNum
     * @returns {SturdyRef}
     */
    makeSturdyRef: (location, swissNum) => {
      // Create a tagged value with 'ocapn-sturdyref' tag and undefined payload
      const sturdyRef = makeTagged('ocapn-sturdyref', undefined);
      // Store the details in the WeakMap
      sturdyRefDetails.set(sturdyRef, { location, swissNum });
      return harden(sturdyRef);
    },
    /**
     * Look up an object by swissnum
     * @param {SwissNum} swissNum
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
