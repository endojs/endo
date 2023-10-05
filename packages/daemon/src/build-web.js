// Establish a perimeter:
import 'ses';
import '@endo/eventual-send/shim.js';
import '@endo/promise-kit/shim.js';
import '@endo/lockdown/commit.js';

import fs from 'fs';

import { writeBundle } from '@endo/compartment-mapper/bundle.js';
import { makeWritePowers, makeReadPowers } from '@endo/compartment-mapper/node-powers.js';

const { write } = makeWritePowers({ fs });
const { read } = makeReadPowers({ fs });


const daemonModuleLocation = new URL(
  'daemon-web.js',
  import.meta.url,
).toString();
const daemonBundleLocation = new URL(
  '../dist-daemon-web-bundle.js',
  import.meta.url,
).toString();
const workerModuleLocation = new URL(
  'worker-web.js',
  import.meta.url,
).toString();
const workerBundleLocation = new URL(
  '../dist-worker-web-bundle.js',
  import.meta.url,
).toString();

const bundleOptions = {
  // node builtin shims for browser
  commonDependencies: {
    'util': 'util',
    'path': 'path-browserify',
    'events': 'events',
    'buffer': 'buffer',
    // dummy fs
    'fs': 'util',
  },
}

async function main() {
  await writeBundle(
    write,
    read,
    daemonBundleLocation,
    daemonModuleLocation,
    bundleOptions,
  )
  await writeBundle(
    write,
    read,
    workerBundleLocation,
    workerModuleLocation,
    bundleOptions,
  )
}

main()