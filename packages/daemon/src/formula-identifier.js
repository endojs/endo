/// <ref types="ses">

const { quote: q } = assert;

const numberPattern = /^[0-9a-f]{128}$/;
const idPattern = /^(?<number>[0-9a-f]{128}):(?<node>[0-9a-f]{128})$/;

/**
 * @param {string} allegedNumber - The formula number or node identifier to test.
 */
export const isValidNumber = allegedNumber =>
  typeof allegedNumber === 'string' && numberPattern.test(allegedNumber);

/**
 * @param {string} allegedNumber - The formula number or node identifier to test.
 */
export const assertValidNumber = allegedNumber => {
  if (!isValidNumber(allegedNumber)) {
    throw assert.error(`Invalid number ${q(allegedNumber)}`);
  }
};

/**
 * @param {string} id
 * @param {string} [petName]
 * @returns {void}
 */
export const assertValidId = (id, petName) => {
  if (typeof id !== 'string' || !idPattern.test(id)) {
    let message = `Invalid formula identifier ${q(id)}`;
    if (petName !== undefined) {
      message += ` for pet name ${q(petName)}`;
    }
    throw new Error(message);
  }
};

/**
 * @param {string} id
 * @returns {import("./types").IdRecord}
 */
export const parseId = id => {
  const match = idPattern.exec(id);
  if (match === null) {
    throw assert.error(`Invalid formula identifier ${q(id)}`);
  }
  const { groups } = match;
  if (groups === undefined) {
    throw assert.error(
      `Programmer invariant failure: expected match groups, formula identifier was ${q(
        id,
      )}`,
    );
  }

  const { number, node } = groups;
  return { number, node };
};

/**
 * @param {import("./types").IdRecord} formulaRecord
 * @returns {string}
 */
export const formatId = ({ number, node }) => {
  const id = `${number}:${node}`;
  assertValidId(id);
  return id;
};
