// @ts-check
/* eslint-disable import/no-dynamic-require */
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
  let fallbackCalls = 0;
  const { namespace } = await importLocation(readPowers, fixture, {
    dynamicHook: (specifier, packageLocation) => {
      fallbackCalls += 1;
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
    },
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
  t.is(fallbackCalls, 0);
});

test('inter-pkg and builtin dynamic require works', async t => {
  const fixture = new URL(
    'fixtures-dynamic/node_modules/hooked-app/index.js',
    import.meta.url,
  ).toString();
  let fallbackCalls = 0;
  const { namespace } = await importLocation(readPowers, fixture, {
    dynamicHook: (specifier, packageLocation) => {
      fallbackCalls += 1;
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
    },
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
  t.is(fallbackCalls, 1);
});
