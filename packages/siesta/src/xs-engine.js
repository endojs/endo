// @ts-check
/* global setTimeout, clearTimeout */
import harden from '@endo/harden';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Fail, q } from '@endo/errors';

/**
 * @import {WorkerEngine, WorkerIncarnation} from './host.js'
 */

/**
 * Escape non-ASCII so every byte crossing the pipe is ASCII, where the
 * binary's C-string handling is exact.
 *
 * @param {unknown} value
 */
const asciiJson = value =>
  JSON.stringify(value).replace(
    /[\u0080-\uffff]/g,
    ch => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );

/**
 * A {@link WorkerEngine} backed by real XS heap snapshots: each
 * incarnation is a `siesta-xs-worker` process (rust/siesta-xs-worker)
 * running the worker shell inside an XS machine, speaking
 * newline-delimited JSON over fd 3/4. `snapshot()` streams the heap into
 * the content-addressed `casPath` and returns its sha256; `start` with a
 * snapshot ref restores the heap without re-evaluating anything.
 *
 * Build inputs: `cargo build --release -p siesta-xs-worker` (after
 * `yarn build:xs-bundles` in this package generates `dist-xs/`).
 *
 * @param {object} options
 * @param {string} options.workerBinary path to the siesta-xs-worker binary
 * @param {string} options.bootPath pre-bundle boot script (dist-xs/boot.js)
 * @param {string} options.bundlePath worker shell bundle (dist-xs/worker-xs.js)
 * @param {string} options.casPath directory for content-addressed snapshots
 * @returns {WorkerEngine}
 */
export const makeXsEngine = ({
  workerBinary,
  bootPath,
  bundlePath,
  casPath,
}) => {
  mkdirSync(casPath, { recursive: true });
  return harden({
    canSnapshot: true,
    /** @type {WorkerEngine['start']} */
    start: async ({ workerName, snapshot, onOutbound }) => {
      const args = [
        '--boot',
        bootPath,
        '--bundle',
        bundlePath,
        '--cas',
        casPath,
      ];
      if (snapshot !== null && snapshot !== undefined) {
        typeof snapshot === 'string' ||
          Fail`XS engine snapshot ref must be a CAS hash string`;
        args.push('--restore', /** @type {string} */ (snapshot));
      }
      const child = spawn(workerBinary, args, {
        stdio: ['ignore', 'inherit', 'inherit', 'pipe', 'pipe'],
      });
      const toChild = /** @type {import('node:stream').Writable} */ (
        child.stdio[3]
      );
      const fromChild = /** @type {import('node:stream').Readable} */ (
        child.stdio[4]
      );

      /** @type {Array<{ expect: string, resolve: (reply: any) => void, reject: (reason: Error) => void }>} */
      const pending = [];
      let exited = false;
      const failAll = reason => {
        while (pending.length > 0) {
          const waiter = pending.shift();
          waiter?.reject(reason);
        }
      };
      // A protocol violation must fail this incarnation's requests and
      // kill the child, never throw inside a stream event handler
      // (which would crash the whole host process).
      const failProtocol = reason => {
        failAll(reason);
        child.kill('SIGKILL');
      };
      child.on('exit', (code, signal) => {
        exited = true;
        failAll(
          Error(
            `siesta-xs-worker for ${workerName} exited (${code ?? signal})`,
          ),
        );
      });
      child.on('error', error => {
        exited = true;
        failAll(
          Error(
            `siesta-xs-worker for ${workerName} failed to spawn: ${
              /** @type {Error} */ (error).message
            }`,
          ),
        );
      });
      toChild.on('error', () => {});
      fromChild.on('error', () => {});

      fromChild.setEncoding('utf8');
      let buffer = '';
      fromChild.on('data', chunk => {
        buffer += chunk;
        let index = buffer.indexOf('\n');
        while (index >= 0) {
          const line = buffer.slice(0, index);
          buffer = buffer.slice(index + 1);
          index = buffer.indexOf('\n');
          if (line !== '') {
            /** @type {any} */
            let reply;
            try {
              reply = JSON.parse(line);
            } catch (_error) {
              failProtocol(Error(`garbled line from XS worker ${workerName}`));
              return;
            }
            if (reply.op === 'outbound') {
              onOutbound(reply.message);
            } else {
              const waiter = pending.shift();
              if (waiter === undefined) {
                failProtocol(
                  Error(`unsolicited ${q(reply.op)} from XS worker`),
                );
                return;
              }
              if (reply.op === waiter.expect) {
                waiter.resolve(reply);
              } else {
                waiter.reject(
                  Error(
                    `XS worker replied ${reply.op}, expected ${waiter.expect}`,
                  ),
                );
              }
            }
          }
        }
      });

      /**
       * @param {Record<string, unknown> | undefined} payload
       * @param {string} expect
       * @returns {Promise<any>}
       */
      const request = (payload, expect) =>
        new Promise((resolve, reject) => {
          if (exited) {
            reject(Error(`siesta-xs-worker for ${workerName} has exited`));
            return;
          }
          pending.push({ expect, resolve, reject });
          if (payload !== undefined) {
            toChild.write(`${asciiJson(payload)}\n`);
          }
        });

      await request(undefined, 'ready');

      /** @type {WorkerIncarnation} */
      const incarnation = {
        deliver: async message => {
          await request({ op: 'deliver', message }, 'ack');
        },
        snapshot: async () => {
          const reply = await request({ op: 'snapshot' }, 'snapshot-ok');
          return reply.ref;
        },
        terminate: async () => {
          if (exited) {
            return;
          }
          const done = new Promise(resolve => child.once('exit', resolve));
          toChild.write('{"op":"exit"}\n');
          const killer = setTimeout(() => child.kill('SIGKILL'), 2000);
          killer.unref?.();
          await done;
          clearTimeout(killer);
        },
      };
      return harden(incarnation);
    },
    releaseSnapshot: async ref => {
      typeof ref === 'string' || Fail`XS engine snapshot ref must be a string`;
      const hash = /** @type {string} */ (ref);
      /^[0-9a-f]{64}$/.test(hash) ||
        Fail`XS engine snapshot ref must be a sha256 hex digest`;
      await rm(join(casPath, hash), { force: true });
    },
  });
};
harden(makeXsEngine);
