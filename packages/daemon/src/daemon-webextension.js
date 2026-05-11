// @ts-nocheck
/* global process */

// Establish a perimeter:
// eslint-disable-next-line import/order
import 'ses';
// eslint-disable-next-line import/order
import '@endo/eventual-send/shim.js';
// eslint-disable-next-line import/order
import '@endo/promise-kit/shim.js';
// eslint-disable-next-line import/order, import/no-unresolved
import '@endo/lockdown/commit.js';

import crypto from 'crypto';
import net from 'net';
import fs from 'fs';
import path from 'path';
import popen from 'child_process';
import url from 'url';

import { makePromiseKit } from '@endo/promise-kit';
// eslint-disable-next-line import/named
import { main } from './daemon.js';
// eslint-disable-next-line import/no-unresolved
import { makePowers } from './daemon-webextension-powers.js';

if (process.argv.length < 5) {
  throw new Error(
    `daemon.js requires arguments [sockPath] [statePath] [ephemeralStatePath] [cachePath], got ${process.argv.join(
      ', ',
    )}`,
  );
}

const [sockPath, statePath, ephemeralStatePath, cachePath] =
  process.argv.slice(2);

/** @type {import('../index.js').Locator} */
const locator = {
  sockPath,
  statePath,
  ephemeralStatePath,
  cachePath,
};

const powers = makePowers({
  crypto,
  net,
  fs,
  path,
  popen,
  url,
});

const { promise: cancelled, reject: cancel } =
  /** @type {import('@endo/promise-kit').PromiseKit<never>} */ (
    makePromiseKit()
  );

process.once('SIGINT', () => cancel(new Error('SIGINT')));

main(powers, locator, process.pid, cancel, cancelled).catch(powers.exitOnError);
