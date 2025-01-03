import 'ses';
import fs from 'fs';
import test from 'ava';
import url from 'url';
import { importLocation } from '@endo/compartment-mapper';
import { makeReadPowers } from '@endo/compartment-mapper/node-powers.js';

// @ts-expect-error XXX Node interface munging
const readPowers = makeReadPowers({ fs, url });
const entry = new URL('../src/index.js', import.meta.url).toString();

test('endo can import nat', async t => {
  const {
    namespace: { isNat },
  } = await importLocation(readPowers, entry);
  t.assert(isNat(0n));
});
