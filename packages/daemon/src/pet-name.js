// @ts-check

const { quote: q } = assert;

const validNamePattern = /^[a-z][a-z0-9-]{0,127}$/;

/**
 * @param {string} petName
 */
export const assertPetName = petName => {
  if (typeof petName !== 'string' || !validNamePattern.test(petName)) {
    throw new Error(`Invalid pet name ${q(petName)}`);
  }
};

/**
 * @param {string | string[]} petNameOrPetNamePath
 */
export const petNamePathFrom = petNameOrPetNamePath =>
  typeof petNameOrPetNamePath === 'string'
    ? [petNameOrPetNamePath]
    : petNameOrPetNamePath;
