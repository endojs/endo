// @ts-check

import harden from '@endo/harden';

/**
 * @typedef {object} BoundaryPolicyContext
 * @property {string} direction
 * @property {string} [slot]
 */

/**
 * @typedef {object} BoundaryPolicy
 * @property {(value: any, context: BoundaryPolicyContext) => void} assertCanExport
 * @property {(value: any, context: BoundaryPolicyContext) => void} assertCanImport
 */

/**
 * @param {Partial<BoundaryPolicy>} [policy]
 * @returns {BoundaryPolicy}
 */
export const makeBoundaryPolicy = (policy = {}) => {
  const {
    assertCanExport = () => {},
    assertCanImport = () => {},
  } = policy;
  return harden({
    assertCanExport,
    assertCanImport,
  });
};

/**
 * @returns {BoundaryPolicy}
 */
export const makeAllowAllBoundaryPolicy = () => {
  return makeBoundaryPolicy();
};
