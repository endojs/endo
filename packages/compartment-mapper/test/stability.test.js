import 'ses';
import test from 'ava';
import { ZipReader } from '@endo/zip';
import { makeArchive, parseArchive } from '../index.js';
import { readPowers } from './scaffold.js';
import { ENTRY_COMPARTMENT } from '../src/policy-format.js';

const fixture = new URL('fixtures-stability/a.js', import.meta.url).toString();

test('order of duplicate name/version packages', async t => {
  const bytes = await makeArchive(readPowers, fixture);

  const reader = new ZipReader(bytes);
  const compartmentMapBytes = reader.files.get('compartment-map.json').content;
  const compartmentMapText = new TextDecoder().decode(compartmentMapBytes);
  const compartmentMap = JSON.parse(compartmentMapText);

  const actualOrder = Object.keys(compartmentMap.compartments);
  t.log(actualOrder);

  t.deepEqual(actualOrder, [
    ENTRY_COMPARTMENT,
    'a',
    'a>dep',
    'b',
    'b>dep',
    'dep',
  ]);

  await t.notThrowsAsync(async () => {
    const app = await parseArchive(bytes);
    const {
      namespace: { default: order },
    } = await app.import();
    t.log(order);
    t.deepEqual(order, [0, 1, 2, 3, 4, 5]);
  });
});
