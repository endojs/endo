/** @import { OcapnLocation } from '../codecs/components.js' */
/** @import { Slot } from '../captp/types.js' */
/** @import { SwissNum } from './types.js' */

/**
 * @typedef {object} GrantDetails
 * @property {OcapnLocation} location
 * @property {Slot} slot
 * @property {'handoff' | 'sturdy-ref'} type
 * @property {SwissNum} [swissNum]
 *
 * @typedef {object} HandoffGiveDetails
 * @property {any} value
 * @property {GrantDetails} grantDetails
 *
 * @typedef {object} GrantTracker
 * @property {(remotable: object, grantDetails: GrantDetails) => void} recordImport
 * @property {(remotable: object) => GrantDetails | undefined} getGrantDetails
 */

/**
 * @param {OcapnLocation} location
 * @param {Slot} slot
 * @param {'handoff' | 'sturdy-ref'} type
 * @param {SwissNum} [swissNum]
 * @returns {GrantDetails}
 */
export const makeGrantDetails = (
  location,
  slot,
  type = 'handoff',
  swissNum = undefined,
) => {
  if (type !== 'handoff' && type !== 'sturdy-ref') {
    throw Error(`Invalid grant type: ${type}`);
  }
  if (type === 'sturdy-ref' && !swissNum) {
    throw Error('Sturdy ref must have a swiss num');
  }
  if (type === 'handoff' && swissNum) {
    throw Error('Handoff must not have a swiss num');
  }
  return harden({ location, slot, type, swissNum });
};

/**
 * @returns {GrantTracker}
 */
export const makeGrantTracker = () => {
  /** @type {WeakMap<object, GrantDetails>} */
  const remotableToGrant = new WeakMap();
  return harden({
    recordImport: (remotable, grantDetails) => {
      const existingGrant = remotableToGrant.get(remotable);
      if (existingGrant) {
        const oldGrantType = existingGrant.type;
        const newGrantType = grantDetails.type;
        if (oldGrantType !== 'handoff' || newGrantType !== 'sturdy-ref') {
          throw Error(
            `Invalid grant type transition: ${oldGrantType} -> ${newGrantType}`,
          );
        }
      }
      remotableToGrant.set(remotable, grantDetails);
    },
    getGrantDetails: remotable => {
      return remotableToGrant.get(remotable);
    },
  });
};
