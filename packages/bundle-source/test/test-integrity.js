import url from 'url';
import test from '@endo/ses-ava/prepare-endo.js';

import bundleSource from '../src/index.js';

test('integrity check', async t => {
  const { moduleFormat, endoZipBase64, endoZipBase64Sha512 } =
    await bundleSource(
      url.fileURLToPath(new URL(`../demo/integrity.js`, import.meta.url)),
      'endoZipBase64',
    );

  const { endoZipBase64Sha512: secondHash } = await bundleSource(
    url.fileURLToPath(new URL(`../demo/integrity.js`, import.meta.url)),
    'endoZipBase64',
  );

  t.is(moduleFormat, 'endoZipBase64');
  t.is(typeof endoZipBase64, 'string');
  t.is(typeof endoZipBase64Sha512, 'string');
  t.is(secondHash, endoZipBase64Sha512);
  t.assert(/^[0-9a-f]{128}$/.test(endoZipBase64Sha512));
});
