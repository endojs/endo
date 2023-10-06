/* global process */

import './web-environment-shim.js';

// Establish a perimeter:
import 'ses';
import '@endo/eventual-send/shim.js';
import '@endo/promise-kit/shim.js';
import '@endo/lockdown/commit.js';

import IdbKvStore from 'idb-kv-store';
import { makeKeyValueFs } from './web-fs.js';
import url from 'url';

import { makePromiseKit } from '@endo/promise-kit';
import { main as workerMain } from './worker.js';
import { makePowers } from './worker-web-powers.js';

const idbStore = new IdbKvStore('endo-daemon')
const { fs } = makeKeyValueFs(idbStore)

const powers = makePowers({ fs, url });

const { promise: cancelled, reject: cancel } =
  /** @type {import('@endo/promise-kit').PromiseKit<never>} */ (
    makePromiseKit()
  );

process.once('SIGINT', () => cancel(new Error('SIGINT')));
process.exitCode = 1;

const main = async () => {
  const initParamsP = new Promise(resolve => globalThis.addEventListener('message', resolve, { once: true }))
  globalThis.postMessage('WORKER_READY')
  const initParams = await initParamsP
  console.log('got init params', initParams)
  const {
    id: workerUuid,
    sockPath,
    statePath,
    ephemeralStatePath,
    cachePath,
  } = initParams;
  /** @type {import('../index.js').Locator} */
  const locator = {
    sockPath,
    statePath,
    ephemeralStatePath,
    cachePath,
  };

  await workerMain(powers, locator, workerUuid, process.pid, cancel, cancelled);
  console.error(`Endo worker exited on pid ${process.pid}`);
  
}

globalThis.startWorker = main