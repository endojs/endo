// @ts-check

/**
 * Parses JSON and, if necessary, throws exceptions that include the location
 * of the offending file.
 *
 * @param {string} source
 * @param {string} location
 */
export const parse = (source, location) => {
  try {
    return JSON.parse(source);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new SyntaxError(`Cannot parse JSON from ${location}, ${error}`);
    }
    throw error;
  }
};
