/**
 * Bundle the XS daemon scripts into a standalone IIFE for evaluation
 * in the XS JavaScript engine.
 *
 * Produces one file:
 *   daemon_bootstrap.js — daemon entry point (CapTP, powers, daemon core)
 *
 * The SES boot script (ses_boot.js) is shared with the worker and
 * produced by bundle-bus-worker-xs.mjs.
 *
 * Usage: node packages/daemon/scripts/bundle-bus-daemon-rust-xs.mjs
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

// Node.js-only packages that must be excluded from the XS daemon bundle.
// These are declared in @endo/daemon's package.json but never imported
// by bus-daemon-rust-xs.js or its transitive dependencies.
const EXCLUDED_PACKAGES = new Set([
  '@endo/stream-node',
  '@endo/compartment-mapper',
  '@endo/import-bundle',
  '@endo/init',
  '@endo/lockdown',
  '@endo/platform/proc',
  '@endo/platform/fs/node',
  '@endo/platform/exo-fs',
  '@endo/relay-server',
  '@endo/where',
  // better-sqlite3 ships native bindings that won't load under
  // XS.  bus-daemon-rust-xs.js passes its own Database constructor
  // (./better-sqlite3-xs.js) to makeDaemonDatabase, so the import
  // never executes at runtime — it only needs to be elided from
  // the bundle's compartment graph.
  'better-sqlite3',
  '@chainsafe/libp2p-noise',
  '@chainsafe/libp2p-yamux',
  '@libp2p/autonat',
  '@libp2p/bootstrap',
  '@libp2p/circuit-relay-v2',
  '@libp2p/crypto',
  '@libp2p/dcutr',
  '@libp2p/identify',
  '@libp2p/kad-dht',
  '@libp2p/ping',
  '@libp2p/webrtc',
  '@libp2p/websockets',
  '@multiformats/multiaddr',
  'libp2p',
  'ses',
  'ws',
]);

// Bundle the daemon entry point
const daemonUrl = url.pathToFileURL(
  path.resolve(__dirname, '../src/bus-daemon-rust-xs.js'),
).href;

const daemonBundle = await makeBundle(readPowers, daemonUrl, {
  packageDependenciesHook: ({ canonicalName, dependencies }) => {
    const filtered = new Set(
      [...dependencies].filter(dep => !EXCLUDED_PACKAGES.has(dep)),
    );
    if (filtered.size !== dependencies.size) {
      const removed = [...dependencies].filter(d => !filtered.has(d));
      console.log(
        `  ${canonicalName}: excluded ${removed.length} Node-only dep(s): ${removed.join(', ')}`,
      );
    }
    return { dependencies: filtered };
  },
});
const daemonPath = path.join(outDir, 'daemon_bootstrap.js');
fs.writeFileSync(daemonPath, daemonBundle);
console.log(`Wrote ${daemonPath} (${daemonBundle.length} bytes)`);
