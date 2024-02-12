/* global process */

import os from 'os';
import { E } from '@endo/far';
import bundleSource from '@endo/bundle-source';
import { makeReaderRef } from '@endo/daemon';
import { withEndoParty } from '../context.js';

const textEncoder = new TextEncoder();

export const bundleCommand = async ({
  applicationPath,
  bundleName,
  partyNames,
  bundleOptions,
}) => {
  const bundle =
    /** @type {{ moduleFormat: 'endoZipBase64', endoZipBase64: string, endoZipBase64Sha512: string }} */
    (
      await bundleSource(applicationPath, {
        ...bundleOptions,
        format: 'endoZipBase64',
      })
    );
  process.stdout.write(`${bundle.endoZipBase64Sha512}\n`);
  const bundleText = JSON.stringify(bundle);
  const bundleBytes = textEncoder.encode(bundleText);
  const readerRef = makeReaderRef([bundleBytes]);
  return withEndoParty(partyNames, { os, process }, async ({ party }) => {
    await E(party).store(readerRef, bundleName);
  });
};
