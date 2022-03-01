// @ts-check
/// <reference types="ses"/>

import { decodeBase64 } from '@endo/base64/decode.js';
import { parseArchive } from '@endo/compartment-mapper/import-archive.js';

const { details: d, quote: q } = assert;

/**
 * Verifies that a bundle passes its own integrity checks or rejects the
 * returned promise with an error.
 * Asserts that the bundle is frozen to guard against inconsistent accessors or
 * get traps.
 *
 * @param {Record<any, any>} bundle
 * @param {(bytes: Uint8Array) => string} computeSha512
 * @param {string} name
 * @returns {Promise<void>}
 */
export const checkBundle = async (
  bundle,
  computeSha512,
  name = '<unknown-bundle>',
) => {
  assert(bundle !== null, d`checkBundle expects a bundle object`);
  assert.typeof(
    bundle,
    'object',
    d`checkBundle cannot hash non-bundle, must be of type object, got ${q(
      bundle,
    )}`,
  );
  assert(
    Object.isFrozen(bundle),
    `checkBundle cannot vouch for the ongoing integrity of an unfrozen object, got ${q(
      bundle,
    )}`,
  );

  const { moduleFormat } = bundle;
  assert.typeof(
    moduleFormat,
    'string',
    d`checkBundle cannot hash non-bundle, moduleFormat must be a string, got ${typeof moduleFormat}`,
  );

  if (moduleFormat === 'endoZipBase64') {
    const { endoZipBase64, endoZipBase64Sha512: expectedSha512 } = bundle;
    assert.typeof(
      endoZipBase64,
      'string',
      d`checkBundle cannot hash non-bundle, property 'endoZipBase64' must be a string, got ${typeof endoZipBase64}`,
    );
    assert.typeof(
      expectedSha512,
      'string',
      d`checkBundle cannot bundle without the property 'endoZipBase64Sha512', which must be a string, got ${typeof expectedSha512}`,
    );
    const bytes = decodeBase64(endoZipBase64);
    const { sha512: parsedSha512 } = await parseArchive(bytes, name, {
      computeSha512,
      expectedSha512,
    });
    assert(parsedSha512 !== undefined);
  } else if (
    moduleFormat === 'getExport' ||
    moduleFormat === 'nestedEvaluate'
  ) {
    assert.fail(
      `checkBundle cannot determine hash of bundle with ${moduleFormat} moduleFormat because it is not necessarilly consistent`,
    );
  } else {
    assert.fail(
      d`checkBundle cannot determine hash of bundle with unrecognized moduleFormat ${q(
        moduleFormat,
      )}`,
    );
  }
};
