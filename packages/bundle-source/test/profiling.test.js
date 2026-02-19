import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import url from 'url';
import test from '@endo/ses-ava/prepare-endo.js';

import bundleSource from '../src/index.js';

test('bundle-source profiling writes a chrome trace file', async t => {
  const traceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bundle-prof-'));
  t.teardown(() => fs.rm(traceDir, { recursive: true, force: true }));

  const entryPath = url.fileURLToPath(
    new URL('../demo/meaning.js', import.meta.url),
  );

  await bundleSource(entryPath, {
    format: 'endoZipBase64',
    profile: {
      enabled: true,
      traceDir,
    },
  });

  const files = await fs.readdir(traceDir);
  t.true(files.length > 0);

  const tracePath = path.join(traceDir, files[0]);
  const traceText = await fs.readFile(tracePath, 'utf-8');
  const trace = JSON.parse(traceText);
  t.true(Array.isArray(trace.traceEvents));

  const names = new Set(trace.traceEvents.map(({ name }) => name));
  t.true(names.has('bundleSource.total'));
  t.true(names.has('bundleSource.mapNodeModules'));
});
