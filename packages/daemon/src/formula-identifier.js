// @ts-check
/// <ref types="ses">

/** @import { IdRecord, FormulaNumber, NodeNumber, FormulaIdentifier } from './types.js' */

import { makeError, q } from '@endo/errors';

const numberPattern = /^[0-9a-f]{64}$/;
const idPattern = /^(?<number>[0-9a-f]{64}):(?<node>[0-9a-f]{64})$/;

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
    throw makeError(`Invalid number ${q(allegedNumber)}`);
  }
};

/**
 * @param {string} allegedFormulaNumber
 * @returns {asserts allegedFormulaNumber is FormulaNumber}
 */
export const assertFormulaNumber = allegedFormulaNumber => {
  if (!isValidNumber(allegedFormulaNumber)) {
    throw makeError(`Invalid formula number ${q(allegedFormulaNumber)}`);
  }
};

/**
 * @param {string} allegedNodeNumber
 * @returns {asserts allegedNodeNumber is NodeNumber}
 */
export const assertNodeNumber = allegedNodeNumber => {
  if (!isValidNumber(allegedNodeNumber)) {
    throw makeError(`Invalid node number ${q(allegedNodeNumber)}`);
  }
};

/**
 * @param {string} id
 * @param {string} [petName]
 * @returns {asserts id is FormulaIdentifier}
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
 * @returns {ParseIdRecord}
 */
export const parseId = id => {
  const match = idPattern.exec(id);
  if (match === null) {
    throw makeError(`Invalid formula identifier ${q(id)}`);
  }
  const { groups } = match;
  if (groups === undefined) {
    throw makeError(
      `Programmer invariant failure: expected match groups, formula identifier was ${q(
        id,
      )}`,
    );
  }

  const { number, node } = groups;
  const formulaNumber = /** @type {FormulaNumber} */ (number);
  const nodeNumber = /** @type {NodeNumber} */ (node);
  return { number: formulaNumber, node: nodeNumber };
};

/**
 * @param {IdRecord} formulaRecord
 * @returns {FormulaIdentifier}
 */
export const formatId = ({ number, node }) => {
  const id = `${String(number)}:${String(node)}`;
  assertValidId(id);
  return /** @type {FormulaIdentifier} */ (id);
};
