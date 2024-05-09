// @ts-check
import 'ses';
import test from 'ava';
import { ZipReader } from '@endo/zip';
import { makeArchive, parseArchive } from '../index.js';
import { readPowers } from './scaffold.js';

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
    'a-v1.0.0',
    'a-v1.0.0-n1',
    'b-v1.0.0',
    'dep-v1.0.0',
    'dep-v1.0.0-n1',
    'dep-v1.0.0-n2',
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
