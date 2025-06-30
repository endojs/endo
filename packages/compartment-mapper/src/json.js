/**
 * Annotates JSON parse exceptions with the location of the source.
 *
 * @module
 */

/**
 * Parses JSON and, if necessary, throws exceptions that include the location of
 * the offending file.
 *
 * @template [T=any] The desired type of the parsed JSON. `unknown` is
 * recommended; using the default is unsafe.
 * @param {string} source
 * @param {string} location
 * @returns {T}
 */
export const parseLocatedJson = (source, location) => {
  try {
    return JSON.parse(source);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw SyntaxError(`Cannot parse JSON from ${location}, ${error}`);
    }
    throw error;
  }
};
