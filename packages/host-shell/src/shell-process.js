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

import { ShellProcessInterface } from './interfaces.js';

/** @import { ShellProcess, ExitStatus, MakeShellProcessOptions } from '../types.js' */

// Pre-synchronize this many byte chunks across CapTP, trading round-trips
// for buffering on a high-latency link.  Applied symmetrically to stdin,
// stdout, and stderr on the responder (this) side.
const STREAM_BUFFER = 64;

/**
 * Run a single host command and surface its stdio as exo-stream byte
 * streams plus a terminal-status promise.  This is the Node-side,
 * platform-specific core; the package's unconfined `make` entry is a
 * thin wrapper that reads its arguments from the formula `env`.
 *
 * By default the command is spawned with a **structured argv** and no
 * shell — `command` is the executable and `args` are passed verbatim, so
 * argument values cannot inject extra commands.  Pass `shell: true` (or a
 * shell path) only when shell features such as pipelines, redirection, or
 * `&&` chaining are actually needed; that re-introduces the injection
 * surface and is therefore opt-in.
 *
 * The child's stdio pipes have a single producer / consumer each, so the
 * three stream accessors are memoized: `stdout()` always returns the
 * same `PassableBytesReader`, never a fresh drain of the same pipe.
 *
 * @param {MakeShellProcessOptions} options
 * @returns {ShellProcess}
 */
export const makeShellProcess = options => {
  const {
    command,
    args = [],
    cwd,
    env: childEnv,
    shell = false,
    context,
  } = options;

  if (typeof command !== 'string' || command.length === 0) {
    throw makeError(
      X`host-shell requires a non-empty command, got ${q(command)}`,
    );
  }
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) {
    throw makeError(X`host-shell args must be an array of strings`);
  }

  const child = spawn(command, [...args], {
    cwd,
    env: childEnv,
    // false (default): structured argv, no shell, no injection.
    // true / path: opt-in shell interpretation for pipelines & chaining.
    shell,
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
    throw makeError(X`host-shell stdio pipes were not available`);
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

  return makeExo('ShellProcess', ShellProcessInterface, {
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
      return 'A running host process. stdin() is an exo-stream byte writer; stdout() and stderr() are exo-stream byte readers; exit() resolves { code, signal }; kill(signal?) signals the process.';
    },
  });
};
harden(makeShellProcess);

/**
 * Parse the optional JSON `args` field from a formula `env` into a
 * structured argv.  A formula `env` is a flat `Record<string, string>`,
 * so the argument vector is carried as a JSON array of strings.
 *
 * @param {string | undefined} value
 * @returns {string[] | undefined}
 */
export const parseArgs = value => {
  if (value === undefined) {
    return undefined;
  }
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw makeError(
      X`host-shell env.args must be a JSON array: ${q(
        /** @type {Error} */ (error).message,
      )}`,
    );
  }
  if (!Array.isArray(parsed) || parsed.some(arg => typeof arg !== 'string')) {
    throw makeError(X`host-shell env.args must be a JSON array of strings`);
  }
  return parsed;
};
harden(parseArgs);

/**
 * Parse the optional `shell` field from a formula `env`.  Absent or
 * `'false'` means a structured argv with no shell; `'true'` enables the
 * default shell; any other string names the shell executable to use.
 *
 * @param {string | undefined} value
 * @returns {boolean | string}
 */
export const parseShell = value => {
  if (value === undefined || value === 'false') {
    return false;
  }
  if (value === 'true') {
    return true;
  }
  return value;
};
harden(parseShell);

/**
 * Parse the optional JSON `processEnv` field from a formula `env`.  A
 * formula `env` is a flat `Record<string, string>`, so a richer child
 * environment is carried as a JSON-encoded object, merged onto the
 * worker's own environment.
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
      X`host-shell env.processEnv must be a JSON object: ${q(
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
      X`host-shell env.processEnv must be a JSON object of string values`,
    );
  }
  return { ...process.env, ...parsed };
};
harden(parseProcessEnv);
