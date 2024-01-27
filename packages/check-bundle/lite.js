// @ts-check
/// <reference types="ses"/>

import { decodeBase64 } from '@endo/base64/decode.js';
import { parseArchive } from '@endo/compartment-mapper/import-archive.js';

import { Fail, X, q } from '@endo/errors';

/**
 * Verifies that a bundle passes its own integrity checks or rejects the
 * returned promise with an error.
 * Asserts that the bundle is frozen to guard against inconsistent accessors or
 * get traps.
 *
 * @param {any} bundle
 * @param {(bytes: Uint8Array) => string} computeSha512
 * @param {string} bundleName
 * @returns {Promise<void>}
 */
export const checkBundle = async (
  bundle,
  computeSha512,
  bundleName = '<unknown-bundle>',
) => {
  assert.typeof(
    bundle,
    'object',
    X`checkBundle cannot hash non-bundle, must be of type object, got ${q(
      bundle,
    )}`,
  );
  if (bundle === null) {
    throw Fail`checkBundle expects a bundle object`;
  }
  Object.isFrozen(bundle) ||
    Fail`checkBundle cannot vouch for the ongoing integrity of an unfrozen object, got ${q(
      bundle,
    )}`;
  const properties = Object.entries(Object.getOwnPropertyDescriptors(bundle));
  const nonValues = properties.filter(
    ([, property]) => typeof property.get === 'function',
  );
  const nonStrings = properties.filter(
    ([, property]) => typeof property.value !== 'string',
  );
  (nonValues.length === 0 && nonStrings.length === 0) ||
    Fail`checkBundle cannot vouch for the ongoing integrity of a bundle ${q(
      bundleName,
    )} with getter properties (has ${nonValues.map(
      ([name]) => name,
    )}) or non-string value properties (has ${nonStrings.map(
      ([name]) => name,
    )})`;

  const { moduleFormat } = bundle;
  assert.typeof(
    moduleFormat,
    'string',
    X`checkBundle cannot hash non-bundle, moduleFormat must be a string, got ${typeof moduleFormat}`,
  );

  if (moduleFormat === 'endoZipBase64') {
    const { endoZipBase64, endoZipBase64Sha512 } = bundle;
    assert.typeof(
      endoZipBase64,
      'string',
      X`checkBundle cannot hash non-bundle, property 'endoZipBase64' must be a string, got ${typeof endoZipBase64}`,
    );
    assert.typeof(
      endoZipBase64Sha512,
      'string',
      X`checkBundle cannot bundle without the property 'endoZipBase64Sha512', which must be a string, got ${typeof endoZipBase64Sha512}`,
    );
    const bytes = decodeBase64(endoZipBase64);
    const { sha512: parsedSha512 } = await parseArchive(bytes, bundleName, {
      computeSha512,
      expectedSha512: endoZipBase64Sha512,
    });
    assert(parsedSha512 !== undefined);
  } else if (
    moduleFormat === 'getExport' ||
    moduleFormat === 'nestedEvaluate'
  ) {
    Fail`checkBundle cannot determine hash of bundle with ${q(
      moduleFormat,
    )} moduleFormat because it is not necessarily consistent`;
  } else {
    Fail`checkBundle cannot determine hash of bundle with unrecognized moduleFormat ${q(
      moduleFormat,
    )}`;
  }
};
