/* global process */

import os from 'os';

import openWebPage from 'open';
import { E } from '@endo/far';
import { makeReaderRef } from '@endo/daemon';
import bundleSource from '@endo/bundle-source';

import { withEndoParty } from './context.js';
import { randomHex16 } from './random.js';

const textEncoder = new TextEncoder();

export const install = async ({
  bundleName,
  partyNames,
  powersName,
  webPageName,
  programPath,
  doOpen,
}) => {
  /** @type {import('@endo/eventual-send').FarRef<import('@endo/stream').Reader<string>> | undefined} */
  let bundleReaderRef;
  /** @type {string | undefined} */
  let temporaryBundleName;
  if (programPath !== undefined) {
    if (bundleName === undefined) {
      // TODO alternately, make a temporary session-scoped GC pet store
      // overshadowing the permanent one, which gets implicitly dropped
      // when this CLI CapTP session ends.
      temporaryBundleName = `tmp-bundle-${await randomHex16()}`;
      bundleName = temporaryBundleName;
    }
    const bundle = await bundleSource(programPath);
    const bundleText = JSON.stringify(bundle);
    const bundleBytes = textEncoder.encode(bundleText);
    bundleReaderRef = makeReaderRef([bundleBytes]);
  }

  await withEndoParty(partyNames, { os, process }, async ({ party }) => {
    // Prepare a bundle, with the given name.
    if (bundleReaderRef !== undefined) {
      await E(party).store(bundleReaderRef, bundleName);
    }

    try {
      /** @type {string | undefined} */
      let webPageUrl;
      if (bundleName !== undefined) {
        ({ url: webPageUrl } = await E(party).provideWebPage(
          webPageName,
          bundleName,
          powersName,
        ));
      } else {
        ({ url: webPageUrl } = await E(party).lookup(webPageName));
      }
      assert(webPageUrl !== undefined);
      process.stdout.write(`${webPageUrl}\n`);
      if (doOpen) {
        openWebPage(webPageUrl);
      }
    } finally {
      if (temporaryBundleName) {
        await E(party).remove(temporaryBundleName);
      }
    }
  });
};
