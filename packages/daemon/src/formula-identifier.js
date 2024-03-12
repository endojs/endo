/// <ref types="ses">

const { quote: q } = assert;

const idPattern = /^(?<number>[0-9a-f]{128}):(?<node>[0-9a-f]{128})$/;

/**
 * @param {string} formulaIdentifier
 * @param {string} [petName]
 * @returns {void}
 */
export const assertValidId = (formulaIdentifier, petName) => {
  if (!idPattern.test(formulaIdentifier)) {
    let message = `Invalid formula identifier ${q(formulaIdentifier)}`;
    if (petName !== undefined) {
      message += ` for pet name ${q(petName)}`;
    }
    throw new Error(message);
  }
};

/**
 * @param {string} formulaIdentifier
 * @returns {import("./types").FormulaIdentifierRecord}
 */
export const parseId = formulaIdentifier => {
  const match = idPattern.exec(formulaIdentifier);
  if (match === null) {
    throw assert.error(`Invalid formula identifier ${q(formulaIdentifier)}`);
  }
  const { groups } = match;
  if (groups === undefined) {
    throw assert.error(
      `Programmer invariant failure: expected match groups, formula identifier was ${q(
        formulaIdentifier,
      )}`,
    );
  }

  const { number, node } = groups;
  return { number, node };
};

/**
 * @param {import("./types").FormulaIdentifierRecord} formulaRecord
 * @returns {string}
 */
export const formatId = ({ number, node }) => {
  const id = `${number}:${node}`;
  assertValidId(id);
  return id;
};
