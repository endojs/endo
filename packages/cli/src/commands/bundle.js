/* global process */

import os from 'os';
import { E } from '@endo/far';
import bundleSource from '@endo/bundle-source';
import { makeReaderRef } from '@endo/daemon';
import { withEndoAgent } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';

const textEncoder = new TextEncoder();

export const bundleCommand = async ({
  applicationPath,
  bundleName,
  agentNames,
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
  assert(bundleName === undefined || typeof bundleName === 'string');
  const bundlePath = bundleName && parsePetNamePath(bundleName);
  process.stdout.write(`${bundle.endoZipBase64Sha512}\n`);
  const bundleText = JSON.stringify(bundle);
  const bundleBytes = textEncoder.encode(bundleText);
  const readerRef = makeReaderRef([bundleBytes]);
  return withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    await E(agent).storeBlob(readerRef, bundlePath);
  });
};
