// @ts-check
/// <reference types="ses"/>

const { quote: q } = assert;

/**
 * @param {string} formulaIdentifier
 */
export const parseFormulaIdentifier = formulaIdentifier => {
  const delimiterIndex = formulaIdentifier.indexOf(':');
  if (delimiterIndex < 0) {
    throw new TypeError(
      `Formula identifier must have a colon: ${q(formulaIdentifier)}`,
    );
  }
  const formulaType = formulaIdentifier.slice(0, delimiterIndex);
  const formulaNumber = formulaIdentifier.slice(delimiterIndex + 1);
  return { formulaType, formulaNumber };
};
