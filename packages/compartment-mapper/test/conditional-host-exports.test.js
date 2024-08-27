import fs from 'fs';
import url from 'url';
import crypto from 'crypto';
import 'ses';
import test from 'ava';
import { importLocation } from '../import.js';
import { makeReadPowers } from '../node-powers.js';

const fixture = new URL(
  'fixtures-conditional-host-exports/node_modules/app/index.js',
  import.meta.url,
).toString();

test('conditional host exports should fall through to ponyfill', async t => {
  const readPowers = makeReadPowers({
    url,
    fs,
    crypto,
  });
  const { namespace } = await importLocation(readPowers, fixture, {
    conditions: new Set([]),
  });
  t.is(namespace.feature, 'ponyfill');
});

test('conditional host exports should exit to import hook', async t => {
  const readPowers = makeReadPowers({
    url,
    fs,
    crypto,
  });
  const { namespace } = await importLocation(readPowers, fixture, {
    conditions: new Set(['endo:lib']),
    importHook(specifier) {
      t.is(specifier, 'endo:lib');
      return { namespace: { feature: 'host' } };
    },
  });
  t.is(namespace.feature, 'host');
});
