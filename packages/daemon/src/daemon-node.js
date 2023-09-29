/* global process */

// Establish a perimeter:
import 'ses';
import '@endo/eventual-send/shim.js';
import '@endo/promise-kit/shim.js';
import '@endo/lockdown/commit.js';

import crypto from 'crypto';
import net from 'net';
import fs from 'fs';
import path from 'path';
import popen from 'child_process';
import url from 'url';
import http from 'http';
import * as ws from 'ws';

import { makePromiseKit } from '@endo/promise-kit';
import { main } from './daemon.js';
import { makePowers } from './daemon-node-powers.js';

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

const { env, kill } = process;

const powers = makePowers({
  locator,
  crypto,
  net,
  fs,
  path,
  popen,
  url,
  http,
  ws,
  env,
  kill,
});

const { promise: cancelled, reject: cancel } =
  /** @type {import('@endo/promise-kit').PromiseKit<never>} */ (
    makePromiseKit()
  );

process.once('SIGINT', () => cancel(new Error('SIGINT')));

process.exitCode = 1;
main(powers, process.pid, cancel, cancelled).then(
  () => {
    process.exitCode = 0;
  },
  error => {
    console.error(error);
  },
);
