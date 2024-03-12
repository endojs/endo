/* global process */
import test from '@endo/ses-ava/prepare-endo.js';

import url from 'url';
import { makeNodeBundleCache } from '../cache.js';

test('bundle-source library is concurrency safe', async t => {
  const dest = url.fileURLToPath(new URL('../bundles', import.meta.url));
  const bundleEntry = url.fileURLToPath(
    new URL('../demo/dir1/index.js', import.meta.url),
  );
  const bundleName = 'dir1';
  const log = () => {};
  const concurrentJobs = Array.from({ length: 5 }).map(async () => {
    const { validateOrAdd } = await makeNodeBundleCache(
      dest,
      { log },
      specifier => import(specifier),
      process.pid,
    );
    await validateOrAdd(bundleEntry, bundleName);
  });
  await Promise.all(concurrentJobs);
  t.pass();
});
