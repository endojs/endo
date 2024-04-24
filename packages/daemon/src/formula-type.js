// @ts-check

const { quote: q } = assert;

// Note: Alphabetically sorted
const formulaTypes = new Set([
  'directory',
  'endo',
  'eval',
  'guest',
  'handle',
  'host',
  'invitation',
  'known-peers-store',
  'least-authority',
  'lookup',
  'loopback-network',
  'make-bundle',
  'make-unconfined',
  'peer',
  'pet-inspector',
  'pet-store',
  'readable-blob',
  'worker',
]);

/** @param {string} allegedType */
export const isValidFormulaType = allegedType => formulaTypes.has(allegedType);

/** @param {string} allegedType */
export const assertValidFormulaType = allegedType => {
  if (!isValidFormulaType(allegedType)) {
    assert.Fail`Unrecognized formula type ${q(allegedType)}`;
  }
};
