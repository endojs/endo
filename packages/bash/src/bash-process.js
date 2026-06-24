// @ts-check
/// <reference types="ses"/>

import { spawn } from 'node:child_process';
import process from 'node:process';

import { makeError, q, X } from '@endo/errors';
import { E } from '@endo/eventual-send';
import { makeExo } from '@endo/exo';
import { bytesReaderFromIterator } from '@endo/exo-stream/bytes-reader-from-iterator.js';
import { bytesWriterFromIterator } from '@endo/exo-stream/bytes-writer-from-iterator.js';
import { makePromiseKit } from '@endo/promise-kit';
import { makeNodeReader, makeNodeWriter } from '@endo/stream-node';

import { BashProcessInterface } from './interfaces.js';

/** @import { BashProcess, ExitStatus, MakeBashProcessOptions } from '../types.js' */

// Pre-synchronize this many byte chunks across CapTP per the user's
// request, trading round-trips for buffering on a high-latency link.
// Applied symmetrically to stdin, stdout, and stderr on the responder
// (this) side.
const STREAM_BUFFER = 64;

/**
 * Spawn `shell -c command` and surface its stdio as exo-stream byte
 * streams plus a terminal-status promise.  This is the Node-side,
 * platform-specific core; the package's unconfined `make` entry is a
 * thin wrapper that reads its arguments from the formula `env`.
 *
 * The child's stdio pipes have a single producer / consumer each, so the
 * three stream accessors are memoized: `stdout()` always returns the
 * same `PassableBytesReader`, never a fresh drain of the same pipe.
 *
 * @param {MakeBashProcessOptions} options
 * @returns {BashProcess}
 */
export const makeBashProcess = options => {
  const {
    command,
    args,
    cwd,
    env: childEnv,
    shell = 'bash',
    context,
  } = options;

  if (typeof command !== 'string' || command.length === 0) {
    throw makeError(X`bash process requires a non-empty command, got ${q(command)}`);
  }

  // With explicit `args`, run the executable directly (no shell parsing);
  // otherwise interpret `command` as a shell script via `shell -c`.
  const [file, argv] =
    args === undefined ? [shell, ['-c', command]] : [command, [...args]];

  const child = spawn(file, argv, {
    cwd,
    env: childEnv,
    // Distinct pipes for all three stdio streams so each can be bridged
    // independently over CapTP.
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  /** @type {import('@endo/promise-kit').PromiseKit<ExitStatus>} */
  const exitKit = makePromiseKit();
  // The exit status may never be awaited by the caller (fire-and-forget
  // commands); register a no-op handler so a rejection (e.g. ENOENT) does
  // not surface as an unhandled rejection at the worker level.
  exitKit.promise.catch(() => {});

  let settled = false;
  child.once('error', error => {
    if (settled) return;
    settled = true;
    exitKit.reject(error);
  });
  child.once('close', (code, signal) => {
    if (settled) return;
    settled = true;
    exitKit.resolve(harden({ code, signal }));
  });

  // A worker formula is cancelled when its dependencies die or the host
  // revokes it; tear the child down rather than orphaning a subprocess.
  if (context !== undefined) {
    E(context)
      .whenCancelled()
      .catch(() => {
        if (child.exitCode === null && !child.killed) {
          child.kill('SIGTERM');
        }
      });
  }

  // child.stdin / stdout / stderr are non-null because every fd was
  // requested as a 'pipe' above; assert to satisfy the type checker and
  // to fail loudly if that ever regresses.
  const { stdin: childStdin, stdout: childStdout, stderr: childStderr } = child;
  if (childStdin === null || childStdout === null || childStderr === null) {
    throw makeError(X`bash process stdio pipes were not available`);
  }

  const stdinWriter = bytesWriterFromIterator(makeNodeWriter(childStdin), {
    buffer: STREAM_BUFFER,
  });
  const stdoutReader = bytesReaderFromIterator(makeNodeReader(childStdout), {
    buffer: STREAM_BUFFER,
  });
  const stderrReader = bytesReaderFromIterator(makeNodeReader(childStderr), {
    buffer: STREAM_BUFFER,
  });

  return makeExo('BashProcess', BashProcessInterface, {
    /**
     * The process's standard input as an exo-stream byte writer.  Drain
     * it from the initiator with `iterateBytesWriter`; `return()` closes
     * (EOFs) the child's stdin.
     */
    stdin() {
      return stdinWriter;
    },

    /**
     * The process's standard output as an exo-stream byte reader.  Drain
     * it from the initiator with `iterateBytesReader`.
     */
    stdout() {
      return stdoutReader;
    },

    /**
     * The process's standard error as an exo-stream byte reader.
     */
    stderr() {
      return stderrReader;
    },

    /**
     * Resolves once the process has exited and its stdio has closed.
     * `code` is the numeric exit code (null if the process was killed by
     * a signal); `signal` is the terminating signal name (null on a
     * normal exit).  Rejects if the process could not be spawned.
     *
     * @returns {Promise<ExitStatus>}
     */
    exit() {
      return exitKit.promise;
    },

    /**
     * Deliver a POSIX signal to the process.
     *
     * @param {NodeJS.Signals | number} [signal]
     * @returns {boolean} whether the signal was delivered
     */
    kill(signal = 'SIGTERM') {
      return child.kill(signal);
    },

    /**
     * @returns {number | undefined} the OS process id
     */
    pid() {
      return child.pid;
    },

    help() {
      return 'A running shell command. stdin() is an exo-stream byte writer; stdout() and stderr() are exo-stream byte readers; exit() resolves { code, signal }; kill(signal?) signals the process.';
    },
  });
};
harden(makeBashProcess);

/**
 * Parse the optional JSON `processEnv` field from a formula `env`.  A
 * formula `env` is a flat `Record<string, string>`, so a richer child
 * environment is carried as a JSON-encoded object.
 *
 * @param {string | undefined} value
 * @returns {Record<string, string> | undefined}
 */
export const parseProcessEnv = value => {
  if (value === undefined) {
    return undefined;
  }
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw makeError(
      X`@endo/bash env.processEnv must be a JSON object: ${q(
        /** @type {Error} */ (error).message,
      )}`,
    );
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    Object.values(parsed).some(entry => typeof entry !== 'string')
  ) {
    throw makeError(
      X`@endo/bash env.processEnv must be a JSON object of string values`,
    );
  }
  return { ...process.env, ...parsed };
};
harden(parseProcessEnv);
