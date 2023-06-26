import { lockdown } from '@endo/lockdown';

import test from 'ava';
import bundleSource from '../src/index.js';

test(`missing entrypoint`, async t => {
  await t.throwsAsync(() => bundleSource('___missing.js', 'endoZipBase64'),
                      { message: 'xxx' });
});
