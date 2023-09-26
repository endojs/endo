/* global process */
import './environment.js'

// Establish a perimeter:
import 'ses';
import '@endo/eventual-send/shim.js';
import '@endo/promise-kit/shim.js';
import '@endo/lockdown/commit.js';

import fs from 'fs';
import url from 'url';

import { makePromiseKit } from '@endo/promise-kit';
import { main as daemonMain } from '../worker.js';
import { makePowers } from './worker-web-powers.js';

console.log('hello from worker-web.js')

// if (process.argv.length < 7) {
//   throw new Error(
//     `worker.js requires arguments workerUuid, daemonSockPath, workerStatePath, workerEphemeralStatePath, workerCachePath, got ${process.argv.join(
//       ', ',
//     )}`,
//   );
// }

// const [workerUuid, sockPath, statePath, ephemeralStatePath, cachePath] =
//   process.argv.slice(2);

// /** @type {import('../index.js').Locator} */
// const locator = {
//   sockPath,
//   statePath,
//   ephemeralStatePath,
//   cachePath,
// };

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

  await daemonMain(powers, locator, workerUuid, process.pid, cancel, cancelled);
  console.error(`Endo worker exited on pid ${process.pid}`);
  
}

main()
// .then(
//   () => {
//     process.exitCode = 0;
//   },
//   error => {
//     console.error(error);
//   },
// );
