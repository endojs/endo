// @ts-check

import { q } from '@endo/errors';

// Note: Alphabetically sorted
const formulaTypes = new Set([
  'directory',
  'endo',
  'eval',
  'guest',
  'handle',
  'host',
  'invitation',
  'keypair',
  'known-peers-store',
  'least-authority',
  'lookup',
  'loopback-network',
  'mail-hub',
  'mailbox-store',
  'make-bundle',
  'make-unconfined',
  'marshal',
  'message',
  'peer',
  'pet-inspector',
  'pet-store',
  'promise',
  'readable-blob',
  'resolver',
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
