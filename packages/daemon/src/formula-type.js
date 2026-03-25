// @ts-check

import { q } from '@endo/errors';

// Note: Alphabetically sorted
const formulaTypes = new Set([
  'channel',
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
  'mount',
  'peer',
  'pet-inspector',
  'pet-store',
  'promise',
  'readable-blob',
  'readable-tree',
  'resolver',
  'scratch-mount',
  'synced-pet-store',
  'timer',
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
