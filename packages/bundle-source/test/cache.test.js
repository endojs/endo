import url from 'url';
import test from '@endo/ses-ava/prepare-endo.js';
import { makeNodeBundleCache } from '../cache.js';

test('cache can capture and verify metadata', async t => {
  const dest = url.fileURLToPath(new URL('../bundles/', import.meta.url));
  const entry = url.fileURLToPath(
    new URL('../demo/meaning.js', import.meta.url),
  );
  const cache = await makeNodeBundleCache(
    dest,
    {},
    specifier => import(specifier),
  );
  await cache.validateOrAdd(entry, 'cache-test-meaning', t.log);
  await cache.validate('cache-test-meaning', undefined, t.log);
  t.pass();
});
