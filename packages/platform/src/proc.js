// @ts-check
/* global process */

import harden from '@endo/harden';
import fs from 'fs';
import path from 'path';

/** @import { ChildProcess } from 'child_process' */

/**
 * Check whether an executable exists on PATH and return its full path,
 * or `null` if not found.
 *
 * Works on both Unix and Windows by checking the platform separator and
 * file-mode bits appropriately.
 *
 * @param {string} prog
 * @returns {Promise<string | null>}
 */
export const whichProg = async prog => {
  const pathEnv = process.env.PATH || process.env.MPATH || '';
  const isWin = process.platform === 'win32';
  const pathDirs = pathEnv.split(isWin ? ';' : ':');
  for (const dir of pathDirs) {
    if (!dir) continue;
    const candidate = path.join(dir, prog);
    // eslint-disable-next-line no-await-in-loop
    const stats = await fs.promises.stat(candidate).catch(() => null);
    if (!stats?.isFile()) {
      continue;
    }
    // On Windows, any file is considered executable.
    if (isWin) {
      return candidate;
    }
    // On Unix-like systems, check the executable bits.
    if ((stats.mode & 0o111) !== 0) {
      return candidate;
    }
  }
  return null;
};
harden(whichProg);

/**
 * Check whether an executable exists on PATH.
 *
 * @param {string} prog
 * @returns {Promise<boolean>}
 */
export const hasProgram = async prog => {
  return (await whichProg(prog)) !== null;
};
harden(hasProgram);

/**
 * Wait for a child process to exit.
 *
 * Resolves with the exit code (defaulting to 0 for `null`),
 * or rejects if the process emits an `'error'` event.
 *
 * @param {ChildProcess} proc
 * @returns {Promise<number>}
 */
export const waitForExit = async proc => {
  return new Promise((resolve, reject) => {
    proc.on('error', err => {
      const [exe] = proc.spawnargs;
      reject(new Error(`Failed to spawn ${exe}`, { cause: err }));
    });
    proc.on('exit', code => resolve(code || 0));
  });
};
harden(waitForExit);

/**
 * Wait for a child process to exit, with cancellation support.
 *
 * If `cancelled` rejects before the process exits, the child is killed
 * and the cancellation error is propagated.
 *
 * @param {ChildProcess} proc
 * @param {Promise<never>} cancelled - a promise that rejects when
 *   cancellation is requested
 * @returns {Promise<number>}
 */
export const waitForExitOrCancel = async (proc, cancelled) => {
  return new Promise((resolve, reject) => {
    proc.on('error', reject);
    proc.on('exit', code => resolve(code || 0));
    cancelled.catch(error => {
      proc.kill();
      reject(error);
    });
  });
};
harden(waitForExitOrCancel);

/**
 * Wait for a child process to emit the `'spawn'` event.
 *
 * @param {ChildProcess} proc
 * @returns {Promise<ChildProcess>}
 */
export const waitForSpawn = async proc => {
  return new Promise((resolve, reject) => {
    proc.on('error', err => {
      const [exe] = proc.spawnargs;
      reject(new Error(`Failed to spawn ${exe}`, { cause: err }));
    });
    proc.on('spawn', () => resolve(proc));
  });
};
harden(waitForSpawn);

/**
 * Wait for a child process to send a message over IPC.
 *
 * @param {ChildProcess} child
 * @returns {Promise<import('child_process').Serializable>}
 */
export const waitForMessage = child => {
  let done = false;
  return new Promise((resolve, reject) => {
    child.on('error', /** @param {Error} cause */ cause => {
      if (!done) {
        done = true;
        reject(new Error(`Failed to spawn ${child.spawnargs}`, { cause }));
      }
    });
    child.on('exit', /** @param {number?} code */ code => {
      if (!done) {
        done = true;
        reject(new Error(`Process ${child.spawnargs} exited ${code}`));
      }
    });
    child.on('message', message => {
      if (!done) {
        done = true;
        resolve(message);
      }
    });
  });
};
harden(waitForMessage);
