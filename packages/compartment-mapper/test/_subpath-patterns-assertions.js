/**
 * Shared assertion logic for subpath pattern tests.
 *
 * Both the Node.js parity tests and the Compartment Mapper (Endo) tests
 * import from this module so that the expected values are defined in exactly
 * one place. If both test suites pass, parity is verified by construction.
 *
 * @module
 */

/** @import {ExecutionContext} from 'ava' */

export const expectedMain = {
  alpha: 'alpha',
  betaGamma: 'beta-gamma',
  exact: 'exact-match',
  helper: 'helper',
  specificity: 'specific',
};

export const expectedConditionalBlue = {
  widget: 'blue-widget',
};

export const expectedConditionalDefault = {
  widget: 'default-widget',
};

/**
 * @param {ExecutionContext} t
 * @param {object} namespace
 */
export const assertMain = (t, namespace) => {
  t.like(namespace, expectedMain);
};

/**
 * @param {ExecutionContext} t
 * @param {object} namespace
 */
export const assertConditionalBlue = (t, namespace) => {
  t.like(namespace, expectedConditionalBlue);
};

/**
 * @param {ExecutionContext} t
 * @param {object} namespace
 */
export const assertConditionalDefault = (t, namespace) => {
  t.like(namespace, expectedConditionalDefault);
};
