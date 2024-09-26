/**
 * Parses the input and returns it as a number if it's valid, otherwise throws error.
 *
 * @param {string} input
 * @returns {number}
 */
export const parseNumber = input => {
  const result = /[0-9]/.test(input || '') ? Number(input) : NaN;

  if (Number.isNaN(result)) {
    throw new Error(`Invalid number: ${input}`);
  }

  return result;
};
