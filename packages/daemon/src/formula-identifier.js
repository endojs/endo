/// <ref types="ses">

const { quote: q } = assert;

const idPattern =
  /^(?:(?<type>endo|readable-blob|worker|pet-store|pet-inspector|eval|lookup|make-unconfined|make-bundle|host|guest|handle|peer|directory|least-authority|loopback-network):)?(?<number>[0-9a-f]{128}):(?<node>[0-9a-f]{128})|(?<type2>web-bundle):(?<number2>[0-9a-f]{32}):(?<node2>[0-9a-f]{128})$/;

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

  // Duplicate capture groups?
  // What if they are provably in disjoint terms of the pattern?
  // Whatever, we can compensate.
  const {
    type2,
    type = type2,
    number2,
    number = number2,
    node2,
    node = node2,
  } = groups;
  return { type, number, node };
};

/**
 * @param {import("./types").FormulaIdentifierRecord} formulaRecord
 * @returns {string}
 */
export const formatId = ({ type, number, node }) => {
  const parts = [number];
  if (type !== undefined) {
    parts.unshift(type);
  }
  if (node !== undefined) {
    parts.push(node);
  }
  const id = parts.join(':');
  assertValidId(id);
  return id;
};
