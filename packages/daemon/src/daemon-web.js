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
import { fs } from './web-fs.js';
// import makeDirectory from 'make-dir';

import { makePromiseKit } from '@endo/promise-kit';
import { E, Far } from '@endo/far';

import { makeDaemon } from './daemon.js';
import { makeFilePowers, makeCryptoPowers } from './daemon-node-powers.js';
import { makeDaemonicPowers } from './daemon-web-powers.js';

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

const cb2promise =
  (obj, method) =>
  (...args) =>
    new Promise((resolve, reject) => {
      obj[method](...args, (err, ...rest) => {
        if (err) {
          reject(err);
        } else {
          // @ts-ignore
          resolve(...rest);
        }
      });
    });

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

// const permissionError = pth => {
// 	// This replicates the exception of `fs.mkdir` with native the
// 	// `recusive` option when run on an invalid drive under Windows.
// 	const error = new Error(`operation not permitted, mkdir '${pth}'`);
// 	error.code = 'EPERM';
// 	error.errno = -4048;
// 	error.path = pth;
// 	error.syscall = 'mkdir';
// 	return error;
// };

// const makeDirectory = async (input, options) => {
//   const fs = options.fs.promises;
//   const path = options.path;

//   const make = async pth => {
//     console.log(`makeDirectory ${pth}`);
//     // workaround for browserfs bug?
//     if (pth === '/') {
//       return pth;
//     }
//     try {
//       await fs.mkdir(pth, options.mode);

//       return pth;
//     } catch (error) {
//       // workaround for browserfs bug?
//       if (error.code === 'EEXIST') {
//         // continue normally
//         return pth;
//       }

//       if (error.code === 'EPERM') {
//         throw error;
//       }

//       if (error.code === 'ENOENT') {
//         if (path.dirname(pth) === pth) {
//           throw permissionError(pth);
//         }

//         if (error.message.includes('null bytes')) {
//           throw error;
//         }

//         await make(path.dirname(pth));

//         return make(pth);
//       }

//       // try {
//       //   const stats = await stat(pth);
//       //   if (!stats.isDirectory()) {
//       //     throw new Error('The path is not a directory');
//       //   }
//       // } catch {
//       //   throw error;
//       // }

//       return pth;
//     }
//   };

//   return make(path.resolve(input));
// };


const makePowers = async () => {
  // shim fs
  // await new Promise(cb => configure({
  //   fs: 'IndexedDB',
  //   options: {},
  // }, cb));
  // // const fs = BFSRequire('fs');
  // // const fsPath = BFSRequire('path');
  // // @ts-ignore
  // fs.promises = {
  //   readFile: cb2promise(fs, 'readFile'),
  //   writeFile: cb2promise(fs, 'writeFile'),
  //   readdir: cb2promise(fs, 'readdir'),
  //   mkdir: cb2promise(fs, 'mkdir'),
  //   rm: cb2promise(fs, 'rmdir'),
  //   rename: cb2promise(fs, 'rename'),
  // };
  // // shim mkdir recursive: true
  // const _mkDir = fs.mkdir;
  // fs.mkdir = (path, options, cb) => {
  //   if (typeof options === 'function') {
  //     cb = options;
  //     options = undefined;
  //   }
  //   if (options && options.recursive) {
  //     makeDirectory(path, {
  //       fs,
  //       path: fsPath,
  //       mode: options.mode,
  //     }).then(() => cb(null), cb);
  //     return;
  //   }
  //   _mkDir.call(fs, path, options, cb);
  // };

  const filePowers = makeFilePowers({ fs, path: fsPath });
  // @ts-ignore
  const cryptoPowers = makeCryptoPowers(crypto);

  const makeWebWorker = () => {
    const worker = new Worker('./dist-worker-web-bundle.js', {
      name: 'Endo Worker',
    });
    return worker;
  }

  const powers = makeDaemonicPowers({
    locator,
    url,
    filePowers,
    cryptoPowers,
    makeWebWorker,

  });
  const { persistence: daemonicPersistencePowers } = powers;

  // try {
  //   console.log(await fs.promises.readdir('/'))
  // } catch (e) {
  //   debugger
  // }
  // try {
  //   console.log(await fs.promises.mkdir('/'))
  // } catch (e) {
  //   debugger
  // }
  // try {
  //   console.log(await fs.promises.readdir('/'))
  // } catch (e) {
  //   debugger
  // }
  // try {
  //   console.log(await fs.promises.mkdir('xyz/'))
  // } catch (e) {
  //   debugger
  // }
  // try {
  //   console.log(await fs.promises.readdir('xyz/'))
  // } catch (e) {
  //   debugger
  // }

  await daemonicPersistencePowers.initializePersistence();

  return powers;
};

const main = async () => {
  const daemonLabel = `daemon in worker`;
  console.log(`Endo daemon starting in worker`);
  cancelled.catch(() => {
    console.log(`Endo daemon stopping in worker`);
  });

  const powers = await makePowers();

  const { endoBootstrap, cancelGracePeriod, assignWebletPort } =
    await makeDaemon(powers, daemonLabel, cancel, cancelled);
  console.log(`Endo daemon started in worker`);

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

  // trigger worker
  console.log('testing worker')
  const result = await E(host).evaluate('NEW', '123', [], [], 'result')
  console.log('testing worker done', result)

};

main()