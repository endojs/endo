// @ts-check
import test from '@endo/ses-ava/prepare-endo.js';

import fs from 'fs';
import url from 'url';
import { decodeBase64 } from '@endo/base64';
import { ZipReader } from '@endo/zip';
import bundleSource from '../src/index.js';

test('no-transforms applies no transforms', async t => {
  const entryPath = url.fileURLToPath(
    new URL(`../demo/circular/a.js`, import.meta.url),
  );
  // @ts-expect-error Property 'endoZipBase64' does not exist on type '{ moduleFormat: "endoScript"; source: string; } | { moduleFormat: "endoZipBase64"; endoZipBase64: string; endoZipBase64Sha512: string; } | { moduleFormat: "nestedEvaluate"; source: string; sourceMap: string; } | { ...; }'.
  const { endoZipBase64 } = await bundleSource(entryPath, {
    moduleFormat: 'endoZipBase64',
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
  // Alleged module type is not precompiled (pre-mjs-json)
  t.is(module.parser, 'mjs');

  const moduleBytes = zipReader.read(
    `${compartment.location}/${module.location}`,
  );
  const moduleText = new TextDecoder().decode(moduleBytes);
  const originalModuleText = await fs.promises.readFile(entryPath, 'utf-8');
  // And, just to be sure, the text in the bundle matches the original text.
  t.is(moduleText, originalModuleText);
});
