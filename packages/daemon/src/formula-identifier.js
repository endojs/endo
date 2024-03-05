const { quote: q } = assert;

/**
 * @param {string} formulaIdentifier
 * @returns {import("./types").FormulaIdentifierRecord}
 */
export const parseFormulaIdentifier = formulaIdentifier => {
  const delimiterIndex = formulaIdentifier.indexOf(':');
  if (delimiterIndex < 0) {
    throw new TypeError(
      `Formula identifier must have a colon: ${q(formulaIdentifier)}`,
    );
  }

  const [type, number, location] = formulaIdentifier.split(':');
  return { type, number, location };
};

/**
 * @param {import("./types").FormulaIdentifierRecord} formulaRecord
 * @returns {string}
 */
export const serializeFormulaIdentifier = ({ type, number, location }) =>
  `${type}:${number}:${location}`;
