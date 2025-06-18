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

test.skip('intra-package dynamic require with inter-package absolute path works without invoking the exitModuleImportNowHook', async t => {
  t.plan(2);
  const fixture = new URL(
    'fixtures-additional-modules/node_modules/goofy/index.js',
    import.meta.url,
  ).toString();
  let importNowHookCallCount = 0;
  /** @type {ExitModuleImportNowHook} */
  const importNowHook = (specifier, packageLocation) => {
    importNowHookCallCount += 1;
    const require = Module.createRequire(
      readPowers.fileURLToPath(packageLocation),
    );
    const ns = require(specifier);
    return freeze(
      /** @type {ThirdPartyStaticModuleInterface} */ ({
        imports: [],
        exports: keys(ns),
        execute: moduleExports => {
          moduleExports.default = ns;
          assign(moduleExports, ns);
        },
      }),
    );
  };
  /** @type {Policy} */
  const policy = {
    entry: {
      packages: WILDCARD_POLICY_VALUE,
      globals: WILDCARD_POLICY_VALUE,
      builtins: WILDCARD_POLICY_VALUE,
    },
    resources: { sprunt: { packages: { 'node-tammy-build': true } } },
  };

  const { namespace } = await importLocation(readPowers, fixture, {
    policy,
    importNowHook,
  });

  t.deepEqual({ default: { isOk: 1 }, isOk: 1 }, { ...namespace });
  t.is(importNowHookCallCount, 0);
});

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
