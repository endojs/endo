import './environment.js'

// Establish a perimeter:
import 'ses';
// import '@endo/eventual-send/shim.js';
import '@endo/promise-kit/shim.js';
import '@endo/lockdown/commit.js';

// import crypto from 'crypto-browserify';
// import net from 'net';
// import fs from 'fs';
// import path from 'path-browserify';
// import popen from 'child_process';
import url from 'url';
// import http from 'http';
// import * as ws from 'ws';
import { Buffer } from 'buffer';

import { configure, BFSRequire } from 'browserfs';
import makeDirectory from 'make-dir';

import { makePromiseKit } from '@endo/promise-kit';
import { main as daemonMain } from '../daemon.js';
import { makePowers } from './daemon-web-powers.js';
import { makeNetstringCapTP } from '../connection.js';
import { E, Far } from '@endo/far';

// if (process.argv.length < 5) {
//   throw new Error(
//     `daemon.js requires arguments [sockPath] [statePath] [ephemeralStatePath] [cachePath], got ${process.argv.join(
//       ', ',
//     )}`,
//   );
// }

const sockPath = 'DAEMON/sock'
const statePath = 'DAEMON/state'
const ephemeralStatePath = 'DAEMON/ephemeralState'
const cachePath = 'DAEMON/cache'
// const [sockPath, statePath, ephemeralStatePath, cachePath] = []
  // process.argv.slice(2);

/** @type {import('../../index.js').Locator} */
const locator = {
  sockPath,
  statePath,
  ephemeralStatePath,
  cachePath,
};

// const { env, kill } = process;
// const env = {};



// const { promise: cancelled, reject: cancel } =
//   /** @type {import('@endo/promise-kit').PromiseKit<never>} */ (
//     makePromiseKit()
//   );

process.once('SIGINT', () => Promise.reject(new Error('SIGINT')));
process.exitCode = 1;

const cb2promise = (obj, method) => (...args) =>
  new Promise((resolve, reject) => {
    obj[method](...args, (err, ...rest) => {
      if (err) {
        reject(err);
      } else {
        resolve(...rest);
      }
    });
  });

async function main () {

  // shim fs
  await new Promise(cb => configure({ fs: 'LocalStorage' }, cb));
  const fs = BFSRequire('fs');
  const path = BFSRequire('path');
  fs.promises = {
    readFile: cb2promise(fs, 'readFile'),
    writeFile: cb2promise(fs, 'writeFile'),
    readdir: cb2promise(fs, 'readdir'),
    mkdir: cb2promise(fs, 'mkdir'),
    rm: cb2promise(fs, 'rmdir'),
    rename: cb2promise(fs, 'rename'),
  }
  // shim mkdir recursive: true
  const _mkDir = fs.mkdir;
  fs.mkdir = (path, options, cb) => {
    if (typeof options === 'function') {
      cb = options;
      options = undefined;
    }
    if (options && options.recursive) {
      makeDirectory(path, {
        fs,
        mode: options.mode,
      }).then(() => cb(null), cb);
      return;
    }
    _mkDir.call(fs, path, options, cb);
  }

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
  }

  const cancel = () => { throw new Error('"cancel" stub called');}
  const cancelled = new Promise(() => {});

  const powers = makePowers({
    crypto,
    // net,
    fs,
    path,
    // popen,
    url,
    // http,
    // ws,
    env: globalThis.process.env,
    // kill,
  });

  // this will happen after the daemon is ready
  setTimeout(async () => {
    console.log('ready')
    const { reader, writer} = globalThis.connect()

    const { getBootstrap, closed } = makeNetstringCapTP(
      'CAPTP FAKE NAME',
      writer,
      reader,
      cancelled,
      // bootstrap, // optional
    );
    const bootstrap = getBootstrap();
    console.log('bootstrap', bootstrap)
    const host = E(bootstrap).host();
    host.then((host) => console.log('host ready', host))

    console.log('x')
    const newGuest = await E(host).provideGuest('guest-agent');
    console.log(newGuest)

    const powersP = newGuest;

    // const importUrl = url.pathToFileURL(importPath);
    // const namespace = await import(importUrl);
    // const result = await namespace.main(powersP, ...args);

    // const main = async (powers, ...args) => {
    //   const patient = E(powers).request(
    //     'HOST',
    //     'a pet for analysis',
    //     'patient',
    //   );
    // };

    // await main(powersP, ...[]);

    // const inbox = await E(host).listMessages()
    // console.log({inbox})

//     const counterSource = `
// import { Far } from '@endo/far';

// export const make = () => {
//   let counter = 0;
//   return Far('Counter', {
//     incr() {
//       counter += 1;
//       return counter;
//     },
//   });
// };
// `
//     console.log('writing counter.js');
//     await fs.writeFile('counter.js', counterSource)
//     // endo make counter.js --name counter
//     console.log('> endo make counter.js --name counter');
//     const result = await E(host).importUnsafeAndEndow(
//       'NEW', // default
//       path.resolve('counter.js'),
//       'NONE', // default
//       'counter',
//     )
//     console.log('< endo make counter.js --name counter');

//     console.log(result);

    /**
     * @param {string | 'MAIN' | 'NEW'} workerName
     * @param {string} source
     * @param {Array<string>} codeNames
     * @param {Array<string>} petNames
     * @param {string} resultName
     */
    const result = await E(host).evaluate(
      'NEW',
      `(15 + 6) * 2`,
      [],
      [],
      'result',
    )
    console.log(result)

  }, 200)

  await daemonMain(powers, locator, process.pid, cancel, cancelled)
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
