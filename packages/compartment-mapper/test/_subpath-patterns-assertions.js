/**
 * Shared assertion logic for subpath pattern tests.
 *
 * Both the Node.js parity tests and the Compartment Mapper (Endo) tests import
 * from this module so that the expected values are defined in exactly one
 * place. If both test suites pass, parity is verified by construction.
 *
 * A shallow clone is taken of the namespace because the result is a `Module`
 * object, which would not otherwise satisfy AVA's `deepEqual` assertion.
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

export const expectedPrecedence = {
  tieBreak: 'suffix-specific',
};

export const expectedImportsEdgeCasesDefault = {
  helper: 'helper',
  cond: 'cond-default',
};

export const expectedImportsEdgeCasesDev = {
  helper: 'helper',
  cond: 'cond-dev',
};

/**
 * A package's own `exports` patterns are keyed by the subpath an importer asks
 * for, so they apply to `own-export-patterns-lib/feature/helper.js` but never
 * to the library's own `./feature/helper.js`.
 */
export const expectedOwnExportPatterns = {
  internal: 'internal-relative',
  external: 'external-subpath',
};

/**
 * @param {ExecutionContext} t
 * @param {object} namespace
 */
export const assertMain = (t, namespace) => {
  t.deepEqual({ ...namespace }, expectedMain);
};

/**
 * @param {ExecutionContext} t
 * @param {object} namespace
 */
export const assertConditionalBlue = (t, namespace) => {
  t.deepEqual({ ...namespace }, expectedConditionalBlue);
};

/**
 * @param {ExecutionContext} t
 * @param {object} namespace
 */
export const assertConditionalDefault = (t, namespace) => {
  t.deepEqual({ ...namespace }, expectedConditionalDefault);
};

/**
 * @param {ExecutionContext} t
 * @param {object} namespace
 */
export const assertPrecedence = (t, namespace) => {
  t.deepEqual({ ...namespace }, expectedPrecedence);
};

/**
 * @param {ExecutionContext} t
 * @param {object} namespace
 */
export const assertImportsEdgeCasesDefault = (t, namespace) => {
  t.deepEqual({ ...namespace }, expectedImportsEdgeCasesDefault);
};

/**
 * @param {ExecutionContext} t
 * @param {object} namespace
 */
export const assertImportsEdgeCasesDev = (t, namespace) => {
  t.deepEqual({ ...namespace }, expectedImportsEdgeCasesDev);
};

/**
 * @param {ExecutionContext} t
 * @param {object} namespace
 */
export const assertOwnExportPatterns = (t, namespace) => {
  t.deepEqual({ ...namespace }, expectedOwnExportPatterns);
};
