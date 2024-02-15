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

  const type = formulaIdentifier.slice(0, delimiterIndex);
  const number = formulaIdentifier.slice(delimiterIndex + 1);
  return { type, number };
};
