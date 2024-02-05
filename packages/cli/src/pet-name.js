/**
 * Splits a dot-delimited pet name path into an array of pet names.
 * Throws if any of the path segments are empty.
 *
 * @param {string} petNamePath - A dot-delimited pet name path.
 * @returns {string[]} - The pet name path, as an array of pet names.
 */
export const parsePetNamePath = petNamePath => {
  const petNames = petNamePath.split('.');
  for (const petName of petNames) {
    if (petName === '') {
      throw new Error(
        `Pet name path "${petNamePath}" contains an empty segment.`,
      );
    }
  }
  return petNames;
};
