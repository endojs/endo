#!/usr/bin/env node --inspect-brk

// This script demonstrates the use of computeSourceMapLocation in Node.js to
// employ the Endo source map cache for debugging.

/* eslint-disable */

import 'ses';
import url from 'url';
import bundleSource from '@endo/bundle-source';
import { importBundle } from '../../src/index.js';
import { computeSourceMapLocation } from '../../src/source-map-node.js';

lockdown();

const start = url.fileURLToPath(new URL('start.js', import.meta.url));

const bundle = await bundleSource(start, {});
await importBundle(
  bundle,
  {
    endowments: { console },
  },
  {
    computeSourceMapLocation,
  },
);
