/**
 * Bundle the SES-adjacent boot script
 * (`packages/daemon/src/bus-worker-xs-ses-boot.js`) into a standalone
 * IIFE for evaluation in the XS JavaScript engine.
 *
 * Produces one file:
 *   ses_boot.js — runs after `polyfills.js` and the host-power
 *   aliases and before the daemon / worker bootstrap.  Installs the
 *   `HandledPromise` shim on `globalThis`.  Despite the name it does
 *   not call `lockdown()`; see the entry point's header.
 *
 * Uses the same compartment-mapper pipeline as
 * `bundle-bus-daemon-rust-xs.mjs` and writes to the same output
 * directory.  Unlike that script it carries no package exclusion
 * list (nor does `bundle-bus-worker-xs.mjs`): module retention
 * follows the entry point's import graph, so a package whose modules
 * are never reached costs nothing.  Steer retention with `exports` /
 * `imports` conditions if that ever changes.
 *
 * Usage: node packages/daemon/scripts/bundle-bus-worker-xs-ses-boot.mjs
 */
import '@endo/init';
import fs from 'fs';
import url from 'url';
import crypto from 'crypto';
import path from 'path';
import { makeBundle } from '@endo/compartment-mapper/bundle.js';
import { makeReadPowers } from '@endo/compartment-mapper/node-powers.js';

const readPowers = makeReadPowers({ fs, url, crypto, path });
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../../../rust/endo/xsnap/src');

const entryUrl = url.pathToFileURL(
  path.resolve(__dirname, '../src/bus-worker-xs-ses-boot.js'),
).href;

const bundle = await makeBundle(readPowers, entryUrl, {});
const outPath = path.join(outDir, 'ses_boot.js');
fs.writeFileSync(outPath, bundle);
console.log(`Wrote ${outPath} (${bundle.length} bytes)`);
