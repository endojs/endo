// @ts-check

import '@endo/init';

import bundleSource from '@endo/bundle-source';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const srcDir = path.resolve(rootDir, 'src/web/lockdown');
const distDir = path.resolve(rootDir, 'dist/web');
const shimName = 'endoify.js';

await mkdir(distDir, { recursive: true });

const { source } = await bundleSource(path.resolve(srcDir, shimName), {
  format: 'endoScript',
});
await writeFile(path.resolve(distDir, shimName), source);
