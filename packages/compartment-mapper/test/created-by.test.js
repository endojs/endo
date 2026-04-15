import 'ses';
import test from 'ava';
import { ZipReader } from '@endo/zip';
import { makeArchive } from '../index.js';
import { assertFileCompartmentMap } from '../src/compartment-map.js';
import { readPowers } from './scaffold.js';

const fixture = new URL(
  'fixtures-retained/node_modules/app/app.js',
  import.meta.url,
).toString();

test('archives do not contain underscore-prefixed properties', async t => {
  const bytes = await makeArchive(readPowers, fixture);

  const reader = new ZipReader(bytes);
  const compartmentMapBytes = reader.files.get('compartment-map.json').content;
  const compartmentMapText = new TextDecoder().decode(compartmentMapBytes);

  t.notRegex(compartmentMapText, /__createdBy/);
});

test('compartment map validator ignores underscore-prefixed properties', t => {
  const compartmentMap = {
    tags: [],
    entry: { compartment: 'app-v1.0.0', module: './main.js' },
    compartments: {
      'app-v1.0.0': {
        name: 'app',
        label: 'app',
        location: 'app-v1.0.0',
        modules: {
          './main.js': {
            location: 'main.js',
            parser: 'mjs',
            sha512: 'abc123',
            __createdBy: 'digest',
            __otherInternal: 'value',
          },
        },
      },
    },
  };

  t.notThrows(() =>
    assertFileCompartmentMap(compartmentMap, 'test-compartment-map'),
  );
});
