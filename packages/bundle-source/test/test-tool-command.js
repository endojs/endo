import test from '@endo/ses-ava/prepare-endo.js';

import url from 'url';
import { execava } from './execava.js';

const cwd = url.fileURLToPath(new URL('..', import.meta.url));
const opts = { cwd };

test('bundle-source command is concurrency safe', async t => {
  const $ = execava(t, opts);
  const concurrentJobs = Array.from({ length: 5 }).map(() =>
    $`node bin/bundle-source --cache-json bundles demo/circular/a.js circular demo/dir1/index.js dir1`.expect(),
  );
  await Promise.all(concurrentJobs);
});
