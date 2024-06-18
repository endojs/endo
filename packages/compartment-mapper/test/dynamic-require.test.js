// @ts-check
/* eslint-disable import/no-dynamic-require */

/** @import {ExitModuleImportNowHook} from '../src/types.js' */
/** @import {SyncModuleTransforms} from '../src/types.js' */

import 'ses';
import test from 'ava';
import fs from 'node:fs';
import { Module } from 'node:module';
import url from 'node:url';
import { importLocation } from '../src/import.js';
import { makeReadPowers } from '../src/node-powers.js';

const readPowers = makeReadPowers({ fs, url });
const { freeze, keys, assign } = Object;

test('intra-package dynamic require works', async t => {
  const fixture = new URL(
    'fixtures-dynamic/node_modules/app/index.js',
    import.meta.url,
  ).toString();
  const { namespace } = await importLocation(readPowers, fixture);

  t.deepEqual(
    {
      default: {
        isOk: 1,
      },
      isOk: 1,
    },
    { ...namespace },
  );
});

test('dynamic require fails without sync read powers', async t => {
  const fixture = new URL(
    'fixtures-dynamic/node_modules/app/index.js',
    import.meta.url,
  ).toString();
  const { read } = readPowers;
  await t.throwsAsync(importLocation(read, fixture), {
    message: /Cannot find module '\.\/sprunt\.js'/,
  });
});

test('dynamic exit module loading fails without importNowHook', async t => {
  const fixture = new URL(
    'fixtures-dynamic/node_modules/hooked-app/index.js',
    import.meta.url,
  ).toString();

  await t.throwsAsync(importLocation(readPowers, fixture), {
    message: /Failed to load module "cluster"/,
  });
});

test('inter-pkg and exit module dynamic require works', async t => {
  const fixture = new URL(
    'fixtures-dynamic/node_modules/hooked-app/index.js',
    import.meta.url,
  ).toString();

  t.plan(2);

  // number of times the `importNowHook` got called
  let importNowHookCallCount = 0;

  /** @type {ExitModuleImportNowHook} */
  const importNowHook = (specifier, packageLocation) => {
    importNowHookCallCount += 1;
    const require = Module.createRequire(
      readPowers.fileURLToPath(packageLocation),
    );
    /** @type {object} */
    const ns = require(specifier);
    return freeze(
      /** @type {import('ses').ThirdPartyStaticModuleInterface} */ ({
        imports: [],
        exports: keys(ns),
        execute: moduleExports => {
          moduleExports.default = ns;
          assign(moduleExports, ns);
        },
      }),
    );
  };

  const { namespace } = await importLocation(readPowers, fixture, {
    importNowHook,
  });

  t.deepEqual(
    {
      default: {
        isOk: 1,
      },
      isOk: 1,
    },
    { ...namespace },
  );
  t.is(importNowHookCallCount, 1);
});

test('sync module transforms work with dynamic require support', async t => {
  const fixture = new URL(
    'fixtures-dynamic/node_modules/app/index.js',
    import.meta.url,
  ).toString();

  t.plan(2);

  let transformCount = 0;

  /** @type {SyncModuleTransforms} */
  const syncModuleTransforms = {
    cjs: sourceBytes => {
      transformCount += 1;
      return {
        bytes: sourceBytes,
        parser: 'cjs',
      };
    },
  };

  const { namespace } = await importLocation(readPowers, fixture, {
    syncModuleTransforms,
  });

  t.deepEqual(
    {
      default: {
        isOk: 1,
      },
      isOk: 1,
    },
    { ...namespace },
  );

  t.true(transformCount > 0);
});

test('sync module transforms work without dynamic require support', async t => {
  const fixture = new URL(
    'fixtures-cjs-compat/node_modules/app/index.js',
    import.meta.url,
  ).toString();

  let transformCount = 0;

  /** @type {SyncModuleTransforms} */
  const syncModuleTransforms = {
    cjs: sourceBytes => {
      transformCount += 1;
      return {
        bytes: sourceBytes,
        parser: 'cjs',
      };
    },
  };

  const { read } = readPowers;
  // no readSync, so no dynamic import support
  await importLocation(read, fixture, {
    syncModuleTransforms,
  });

  t.true(transformCount > 0);
});
