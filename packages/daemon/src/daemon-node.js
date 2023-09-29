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
import { makeDaemon } from './daemon.js';
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

const { pid, env, kill } = process;

const powers = makePowers({
  locator,
  pid,
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

const main = async () => {
  const daemonLabel = `daemon on PID ${pid}`
  console.log(`Endo daemon starting on PID ${pid}`);
  cancelled.catch(() => {
    console.log(`Endo daemon stopping on PID ${pid}`);
  });
  
  await makeDaemon(powers, daemonLabel, cancel, cancelled);
}

process.once('SIGINT', () => cancel(new Error('SIGINT')));

process.exitCode = 1;
main().then(
  () => {
    process.exitCode = 0;
  },
  error => {
    console.error(error);
  },
);
