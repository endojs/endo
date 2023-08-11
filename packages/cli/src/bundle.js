/* global process */

import { E } from '@endo/far';
import bundleSource from '@endo/bundle-source';
import { makeReaderRef } from '@endo/daemon';

import { provideEndoClient } from './client.js';

const textEncoder = new TextEncoder();

export const bundleCommand = async ({
  cancel,
  cancelled,
  sockPath,
  applicationPath,
  bundleName,
  partyNames,
}) => {
  const bundle = await bundleSource(applicationPath);
  process.stdout.write(`${bundle.endoZipBase64Sha512}\n`);
  const bundleText = JSON.stringify(bundle);
  const bundleBytes = textEncoder.encode(bundleText);
  const readerRef = makeReaderRef([bundleBytes]);
  const { getBootstrap } = await provideEndoClient('cli', sockPath, cancelled);
  try {
    const bootstrap = getBootstrap();
    let party = E(bootstrap).host();
    for (const partyName of partyNames) {
      party = E(party).provide(partyName);
    }
    await E(party).store(readerRef, bundleName);
  } catch (error) {
    console.error(error);
    cancel(error);
  }
};
