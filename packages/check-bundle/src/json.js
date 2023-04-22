// @ts-check

// For enquoting strings
const q = JSON.stringify;

/**
 * Parses JSON and, if necessary, throws exceptions that include the location
 * of the offending file.
 *
 * @param {string} source
 * @param {string} location
 */
export const parseLocatedJson = (source, location) => {
  try {
    return JSON.parse(source);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw SyntaxError(`Cannot parse JSON from ${q(location)}, ${error}`);
    }
    throw error;
  }
};
