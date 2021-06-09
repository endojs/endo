import 'ses';
import fs from 'fs';
import test from 'ava';
import { importLocation } from '@endo/compartment-mapper';

const entry = new URL('../src/index.js', import.meta.url).toString();

const read = async location => fs.promises.readFile(new URL(location).pathname);

test('endo can import nat', async t => {
  const {
    namespace: { isNat },
  } = await importLocation(read, entry);
  t.assert(isNat(0n));
});
