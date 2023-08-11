/* global process */

import path from 'path';

import bundleSource from '@endo/bundle-source';
import { makeReaderRef } from '@endo/daemon';
import { E } from '@endo/far';

import { provideEndoClient } from './client.js';
import { randomHex16 } from './random.js';

const textEncoder = new TextEncoder();

export const makeCommand = async ({
  cancel,
  cancelled,
  sockPath,
  filePath,
  importPath,
  resultName,
  bundleName,
  workerName,
  partyNames,
  powersName,
}) => {
  if (filePath !== undefined && importPath !== undefined) {
    console.error('Specify only one of [file] or --UNSAFE <file>');
    process.exitCode = 1;
    return;
  }
  if (
    filePath === undefined &&
    importPath === undefined &&
    bundleName === undefined
  ) {
    console.error(
      'Specify at least one of [file], --bundle <file>, or --UNSAFE <file>',
    );
    process.exitCode = 1;
    return;
  }

  /** @type {import('@endo/eventual-send').ERef<import('@endo/stream').Reader<string>> | undefined} */
  let bundleReaderRef;
  /** @type {string | undefined} */
  let temporaryBundleName;
  if (filePath !== undefined) {
    if (bundleName === undefined) {
      // TODO alternately, make a temporary session-scoped GC pet store
      // overshadowing the permanent one, which gets implicitly dropped
      // when this CLI CapTP session ends.
      temporaryBundleName = `tmp-bundle-${await randomHex16()}`;
      bundleName = temporaryBundleName;
    }
    const bundle = await bundleSource(filePath);
    const bundleText = JSON.stringify(bundle);
    const bundleBytes = textEncoder.encode(bundleText);
    bundleReaderRef = makeReaderRef([bundleBytes]);
  }

  const { getBootstrap } = await provideEndoClient('cli', sockPath, cancelled);
  try {
    const bootstrap = getBootstrap();
    let party = E(bootstrap).host();
    for (const partyName of partyNames) {
      party = E(party).provide(partyName);
    }

    // Prepare a bundle, with the given name.
    if (bundleReaderRef !== undefined) {
      await E(party).store(bundleReaderRef, bundleName);
    }

    const resultP =
      importPath !== undefined
        ? E(party).importUnsafeAndEndow(
            workerName,
            path.resolve(importPath),
            powersName,
            resultName,
          )
        : E(party).importBundleAndEndow(
            workerName,
            bundleName,
            powersName,
            resultName,
          );
    const result = await resultP;
    console.log(result);

    if (temporaryBundleName) {
      await E(party).remove(temporaryBundleName);
    }
  } catch (error) {
    console.error(error);
    cancel(error);
  }
};
