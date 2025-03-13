// @ts-check
import test from '@endo/ses-ava/prepare-endo.js';

import url from 'url';
import { decodeBase64 } from '@endo/base64';
import { ZipReader } from '@endo/zip';
import bundleSource from '../src/index.js';

test('no-transforms applies no transforms', async t => {
  const entryPath = url.fileURLToPath(
    new URL(`../demo/fortune.ts`, import.meta.url),
  );
  const { endoZipBase64 } = await bundleSource(entryPath, {
    format: 'endoZipBase64',
    noTransforms: true,
  });
  const endoZipBytes = decodeBase64(endoZipBase64);
  const zipReader = new ZipReader(endoZipBytes);
  const compartmentMapBytes = zipReader.read('compartment-map.json');
  const compartmentMapText = new TextDecoder().decode(compartmentMapBytes);
  const compartmentMap = JSON.parse(compartmentMapText);
  const { entry, compartments } = compartmentMap;
  const compartment = compartments[entry.compartment];
  const module = compartment.modules[entry.module];
  // Transformed from TypeScript:
  t.is(module.parser, 'mjs');

  const moduleBytes = zipReader.read(
    `${compartment.location}/${module.location}`,
  );
  const moduleText = new TextDecoder().decode(moduleBytes);
  t.is(
    moduleText.trim(),
    `export const fortune         = 'outlook uncertain';`,
    // Erased:           : string
  );
});
