/* eslint-disable no-shadow */
/* eslint-disable import/no-dynamic-require */

/**
 * @import {
 *   ExitModuleImportNowHook, Policy,
 *   SyncModuleTransforms,
 * } from '../src/types.js'
 * @import {ThirdPartyStaticModuleInterface} from 'ses'
 */

import 'ses';
import test from 'ava';
import fs from 'node:fs';
import { Module } from 'node:module';
import path from 'node:path';
import url from 'node:url';
import { importLocation } from '../src/import.js';
import { makeReadNowPowers } from '../src/node-powers.js';
import { WILDCARD_POLICY_VALUE } from '../src/policy-format.js';

const readPowers = makeReadNowPowers({ fs, url, path });
const { freeze, keys, assign } = Object;

test('dynamic require of an item above entrypoint', async t => {
  const fixture = new URL(
    'fixtures-additional-modules/node_modules/goofy/index.js',
    import.meta.url,
  ).toString();
  const secondEntry = new URL(
    'fixtures-additional-modules/config.js',
    import.meta.url,
  ).toString();

  await t.notThrowsAsync(async () => {
    const { namespace } = await importLocation(readPowers, fixture, {
      otherEntrypoints: [secondEntry],
    });
    t.log(namespace);
  });
});

test('dynamic require of an item above entrypoint with policy', async t => {
  const fixture = new URL(
    'fixtures-additional-modules/node_modules/goofy/index.js',
    import.meta.url,
  ).toString();
  const secondEntry = new URL(
    'fixtures-additional-modules/config.js',
    import.meta.url,
  ).toString();

  /** @type {Policy} */
  const policy = {
    entry: {
      packages: { '$external:app': true, paperino: true },
      globals: WILDCARD_POLICY_VALUE,
      builtins: WILDCARD_POLICY_VALUE,
    },
    resources: {
      // goofy: { packages: { '$external:app': true } },
      '$external:app': { packages: { '$external:app>pippo': true } },
      '$external:app>pippo': {
        packages: { '$external:app>pippo>gambadilegno': true },
      },
      // I forget, is this how we allow importing from root?
      '$external:app>pippo>gambadilegno': { packages: { 'goofy': true } },
    },
  };

  await t.notThrowsAsync(async () => {
    const { namespace } = await importLocation(readPowers, fixture, {
      policy,
      otherEntrypoints: [secondEntry],
    });
    t.log(namespace);
  });
});
