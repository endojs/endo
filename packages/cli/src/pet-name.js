import { q } from '@endo/errors';

/**
 * Splits a dot-delimited pet name path into an array of pet names.
 * Throws if the path is not a string or if any of the path segments are empty.
 *
 * @param {string} petNamePath - A dot-delimited pet name path.
 * @returns {string[]} - The pet name path, as an array of pet names.
 */
export const parsePetNamePath = petNamePath => {
  assert(typeof petNamePath === 'string');

  const petNames = petNamePath.split('.');
  for (const petName of petNames) {
    if (petName === '') {
      throw Error(`Pet name path ${q(petNamePath)} contains an empty segment.`);
    }
  }
  return petNames;
};

/**
 * Like {@link parsePetNamePath}, but immediately returns `undefined` values.
 *
 * @param {string | undefined} optionalPetNamePath - A dot-delimited pet name path,
 * or `undefined`.
 * @returns {string[] | undefined} - The pet name path as an array of pet names, or
 * `undefined`.
 */
export const parseOptionalPetNamePath = optionalPetNamePath => {
  assert(
    optionalPetNamePath === undefined ||
      typeof optionalPetNamePath === 'string',
  );

  return optionalPetNamePath === undefined
    ? undefined
    : parsePetNamePath(optionalPetNamePath);
};
