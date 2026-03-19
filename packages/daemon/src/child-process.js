// @ts-check

/** @import { ChildProcess } from 'child_process' */

/**
 * Wait for a child process to exit.
 *
 * Resolves with the exit code (defaulting to 0 for `null`), or rejects
 * if the process emits an `'error'` event.
 *
 * @param {ChildProcess} proc
 * @returns {Promise<number>}
 */
const waitForExit = async proc => {
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
const waitForExitOrCancel = async (proc, cancelled) => {
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
const waitForSpawn = async proc => {
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
const waitForMessage = child => {
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

export { waitForExit, waitForExitOrCancel, waitForSpawn, waitForMessage };
