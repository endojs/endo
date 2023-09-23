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

const bundleLocation = new URL(
  'web/dist-daemon-web-bundle.js',
  import.meta.url,
).toString();
const moduleLocation = new URL(
  'web/daemon-web.js',
  import.meta.url,
).toString();

console.log({bundleLocation, moduleLocation});

async function main() {
  await writeBundle(
    write,
    read,
    bundleLocation,
    moduleLocation,
    {
      // node builtin shims for browser
      commonDependencies: {
        'util': 'util',
        'path': 'path-browserify',
        'events': 'events',
        // noop
        'fs': 'util',
      },
    },
  )
}

main()