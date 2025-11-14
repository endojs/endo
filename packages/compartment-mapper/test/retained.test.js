import 'ses';
import test from 'ava';
import { ZipReader } from '@endo/zip';
import { makeArchive, parseArchive } from '../index.js';
import { readPowers } from './scaffold.js';

const fixture = new URL(
  'fixtures-retained/node_modules/app/app.js',
  import.meta.url,
).toString();

test('archives only contain compartments retained by modules', async t => {
  const bytes = await makeArchive(readPowers, fixture);

  await t.notThrowsAsync(async () => {
    const app = await parseArchive(bytes);
    const {
      namespace: { mark },
    } = await app.import();
    t.is(mark, 42);
  });

  const reader = new ZipReader(bytes);
  const compartmentMapBytes = reader.files.get('compartment-map.json').content;
  const compartmentMapText = new TextDecoder().decode(compartmentMapBytes);
  const compartmentMap = JSON.parse(compartmentMapText);
  t.deepEqual(Object.keys(compartmentMap.compartments), [
    'app-v1.0.0',
    'mk1-v1.0.0',
    'mk2-v1.0.0',
    // Notably absent:
    // 'sweep-v1.0.0',
  ]);
  t.deepEqual(
    Object.keys(compartmentMap.compartments['app-v1.0.0'].modules).sort(),
    [
      './app.js',
      // Notably absent: 'app',
      'mk1',
      // Notably absent: 'mk1/bogus.js',
      // Notably absent: 'sweep',
    ],
  );
});
