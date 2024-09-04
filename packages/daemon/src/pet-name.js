// @ts-check

import { q } from '@endo/errors';

const validNamePattern = /^[a-z][a-z0-9-]{0,127}$/;

/**
 * @param {string} petName
 */
export const isPetName = petName => validNamePattern.test(petName);

/**
 * @param {string} petName
 */
export const assertPetName = petName => {
  if (typeof petName !== 'string' || !isPetName(petName)) {
    throw Error(`Invalid pet name ${q(petName)}`);
  }
};

/**
 * @param {string[]} petNamePath
 */
export const assertPetNamePath = petNamePath => {
  if (!Array.isArray(petNamePath) || petNamePath.length < 1) {
    throw Error(`Invalid pet name path`);
  }
  for (const petName of petNamePath) {
    assertPetName(petName);
  }
};

/**
 * @param {string | string[]} petNameOrPetNamePath
 */
export const petNamePathFrom = petNameOrPetNamePath =>
  typeof petNameOrPetNamePath === 'string'
    ? [petNameOrPetNamePath]
    : petNameOrPetNamePath;
