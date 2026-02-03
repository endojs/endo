/**
 * Parses the input and returns it as a bigint if it's a valid integer.
 *
 * @param {string} input
 * @returns {bigint}
 */
export const parseBigint = (input = '') => {
  const trimmed = input.trim();
  if (!/^(0|[1-9][0-9]*)$/.test(trimmed)) {
    throw new Error(`Invalid number: ${input}`);
  }
  return BigInt(trimmed);
};
