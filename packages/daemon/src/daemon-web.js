// @ts-check
/* global process */

import './web-environment-shim.js'

// Establish a perimeter:
import 'ses';
import '@endo/eventual-send/shim.js';
import '@endo/promise-kit/shim.js';
// import '@endo/lockdown/commit.js';
import '@endo/lockdown/commit-debug.js';

import url from 'url';
import { Buffer } from 'buffer';
// import { configure, BFSRequire } from 'browserfs';
// import { configure, fs } from './browserfs.mjs';
import fsPath from 'path';
import IdbKvStore from 'idb-kv-store';
import { makeKeyValueFs } from './web-fs.js';
// import makeDirectory from 'make-dir';

import { makePromiseKit } from '@endo/promise-kit';
import { E, Far } from '@endo/far';

import { makeDaemon } from './daemon.js';
import { makeFilePowers, makeCryptoPowers } from './daemon-node-powers.js';
import { makeDaemonicPowers, makePortConnection } from './daemon-web-powers.js';

import {
  makeMessageCapTP,
  messageToBytes,
  bytesToMessage,
} from './connection.js';
import { mapReader, mapWriter } from '@endo/stream';

const sockPath = 'DAEMON/sock';
const statePath = 'DAEMON/state';
const ephemeralStatePath = 'DAEMON/ephemeralState';
const cachePath = 'DAEMON/cache';

/** @type {import('../types.js').Locator} */
const locator = {
  sockPath,
  statePath,
  ephemeralStatePath,
  cachePath,
};

const { pid, env, kill } = process;

const informParentWhenReady = () => {
  if (process.send) {
    process.send({ type: 'ready' });
  }
};

const reportErrorToParent = message => {
  if (process.send) {
    process.send({ type: 'error', message });
  }
};

const { promise: cancelled, reject: cancel } =
  /** @type {import('@endo/promise-kit').PromiseKit<never>} */ (
    makePromiseKit()
  );

// shim crypto
const crypto = {
  createHash (algorithm) {
    if (algorithm !== 'sha512') {
      throw new Error("Only 'sha512' is supported.");
    }
  
    let buffer = new Uint8Array();
  
    return {
      update(data) {
        const textEncoder = new TextEncoder();
        const newData = typeof data === 'string' ? textEncoder.encode(data) : data;
        const combined = new Uint8Array(buffer.length + newData.length);
        combined.set(buffer);
        combined.set(newData, buffer.length);
        buffer = combined;
        return this; // For chaining
      },
      async digest(encoding) {
        const hash = await globalThis.crypto.subtle.digest('SHA-512', buffer);
        if (encoding === 'hex') {
          return Array.from(new Uint8Array(hash))
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');
        } else {
          throw new Error("Only 'hex' encoding is supported.");
        }
      }
    };
  },
  randomBytes (size, cb) {
    const buffer = Buffer.alloc(size);
    globalThis.crypto.getRandomValues(buffer);
    if (cb) {
      cb(null, buffer);
    } else {
      return buffer;
    }
  },
};


const makePowers = async ({ makeWebWorker }) => {
  if (!makeWebWorker) {
    throw new Error('makeWebWorker is required');
  }

  const idbStore = new IdbKvStore('endo-daemon')
  const { fs } = makeKeyValueFs(idbStore)

  const filePowers = makeFilePowers({ fs, path: fsPath });
  // @ts-ignore
  const cryptoPowers = makeCryptoPowers(crypto);

  const powers = makeDaemonicPowers({
    locator,
    url,
    filePowers,
    cryptoPowers,
    makeWebWorker,

  });
  const { persistence: daemonicPersistencePowers } = powers;
  await daemonicPersistencePowers.initializePersistence();

  return powers;
};

const main = async ({ makeWebWorker }) => {
  const daemonLabel = `daemon in worker`;
  console.log(`Endo daemon starting in worker`);
  cancelled.catch(() => {
    console.log(`Endo daemon stopping in worker`);
  });

  const powers = await makePowers({ makeWebWorker });

  const { endoBootstrap, cancelGracePeriod } =
    await makeDaemon(powers, daemonLabel, cancel, cancelled);

  /** @param {Error} error */
  const exitWithError = error => {
    cancel(error);
    cancelGracePeriod(error);
  };

  const host = E(endoBootstrap).host();

  const newGuest = await E(host).provideGuest('guest-agent');

  globalThis.b = endoBootstrap;
  globalThis.E = E;
  globalThis.host = host;
  globalThis.guest = newGuest;

  // // trigger worker
  // console.log('testing worker')
  // const result = await E(host).evaluate('NEW', '123', [], [], 'result')
  // console.log('testing worker done', result)

  const connectGuestPort = async (port, guestId) => {
    const { reader: portReader, writer: portWriter } = makePortConnection(port);

    const messageWriter = mapWriter(portWriter, messageToBytes);
    const messageReader = mapReader(portReader, bytesToMessage);

    console.log('daemon connecting to incomming guest')
    const { closed: capTpClosed, getBootstrap } = makeMessageCapTP(
      'Endo',
      messageWriter,
      messageReader,
      cancelled,
      // newGuest, // bootstrap
      host, // bootstrap
    );
    await getBootstrap();
    console.log('daemon connected to incomming guest!')

    await capTpClosed;
    console.log('captp peer closed')
  };


  return { connectGuestPort }
};

globalThis.startDaemon = main;