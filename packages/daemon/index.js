// @ts-check
/* global process */

import url from 'url';
import popen from 'child_process';
import fs from 'fs';
import path from 'path';

import { E } from '@endo/eventual-send';
import { whereEndoState, whereEndoSock, whereEndoCache } from '@endo/where';
import { makeEndoClient } from './src/client.js';

const defaultLocator = {
  statePath: whereEndoState(process.platform, process.env),
  sockPath: whereEndoSock(process.platform, process.env),
  cachePath: whereEndoCache(process.platform, process.env),
};

const endoDaemonPath = url.fileURLToPath(new URL('src/daemon.js', import.meta.url));

export const terminate = async (locator = defaultLocator) => {
  const { getBootstrap, finalize } = await makeEndoClient(
    'harbinger',
    locator.sockPath,
  );
  const bootstrap = getBootstrap();
  await E(E.get(bootstrap).privateFacet).terminate(locator);
  finalize();
};

export const start = async (locator = defaultLocator) => {
  const cachePathCreated = fs.promises.mkdir(locator.cachePath, {
    recursive: true,
  });
  const statePathCreated = fs.promises.mkdir(locator.statePath, {
    recursive: true,
  });

  await cachePathCreated;
  const logPath = path.join(locator.cachePath, 'endo.log');

  await statePathCreated;
  const output = fs.openSync(logPath, 'a');

  const child = popen.fork(
    endoDaemonPath,
    [locator.sockPath, locator.statePath, locator.cachePath],
    {
      detached: true,
      stdio: ['ignore', output, output, 'ipc'],
    },
  );

  return new Promise((resolve, reject) => {
    child.on('error', (/** @type {Error} */ cause) => {
      reject(
        new Error(
          `Daemon exited prematurely with error ${cause.message}, see (${logPath})`,
        ),
      );
    });
    child.on('exit', (/** @type {number?} */ code) => {
      reject(
        new Error(
          `Daemon exited prematurely with code (${code}), see (${logPath})`,
        ),
      );
    });
    child.on('message', _message => {
      child.disconnect();
      child.unref();
      resolve();
    });
  });
};

export const clean = async (locator = defaultLocator) => {
  if (process.platform !== 'win32') {
    await fs.promises.unlink(locator.sockPath).catch(error => {
      if (error.code === 'ENOENT') {
        return;
      }
      throw error;
    });
  }
};

export const restart = async (locator = defaultLocator) => {
  if (restart) {
    await terminate(locator).catch(() => {});
    await clean(locator);
  }
  return start(locator);
};

export const stop = async (locator = defaultLocator) => {
  return terminate(locator).catch(() => {});
};
