// @ts-check
/// <reference types="ses"/>

import { spawn } from 'node:child_process';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';

import { makeError, q, X } from '@endo/errors';
import { E } from '@endo/eventual-send';
import { makeExo } from '@endo/exo';
import { bytesReaderFromIterator } from '@endo/exo-stream/bytes-reader-from-iterator.js';
import { bytesWriterFromIterator } from '@endo/exo-stream/bytes-writer-from-iterator.js';
import { makePromiseKit } from '@endo/promise-kit';
import { makeNodeWriter } from '@endo/stream-node';

import { ShellProcessInterface } from './interfaces.js';

/** @import { ShellProcess, ExitStatus, MakeShellProcessOptions } from './types.js' */

// Pre-synchronize this many byte chunks across CapTP, trading round-trips
// for buffering on a high-latency link.  Applied symmetrically to stdin,
// stdout, and stderr on the responder (this) side.
const STREAM_BUFFER = 64;

// When the in-memory capture queue holds at least this many bytes the
// source is paused, so a slow remote consumer applies backpressure to the
// child rather than letting an unbounded `yes`-style firehose grow the
// heap.  Gating on bytes (not chunk count) bounds the actual memory a
// stalled stream can hold.
const READ_HIGH_WATER_BYTES = 256 * 1024;

// Grace period after a SIGTERM (from a timeout, output cap, or
// cancellation) before escalating to SIGKILL, so a child that ignores or
// traps SIGTERM is still reaped rather than hanging the formula forever.
const KILL_GRACE_MS = 5000;

/**
 * Environment variables a spawned child inherits from the worker by
 * default.  Everything else (daemon secrets, credential-helper tokens,
 * `ENDO_*`, cloud keys) is withheld unless the caller opts into full
 * inheritance with `inheritEnv`.  PATH must be present or `spawn` cannot
 * resolve the executable at all; the rest give the child a usable locale
 * and scratch space without leaking ambient configuration.
 */
const SAFE_ENV_KEYS = harden([
  'PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  'TMPDIR',
  'TZ',
  'USER',
  'LOGNAME',
  // Windows equivalents.
  'SystemRoot',
  'ComSpec',
  'PATHEXT',
  'WINDIR',
  'TEMP',
  'TMP',
]);

/**
 * Reject NUL bytes at the boundary so a truncated value cannot reach the
 * exec arguments the kernel actually sees.
 *
 * @param {string} value
 * @param {string} field
 */
const requireNoNul = (value, field) => {
  if (value.includes('\0')) {
    throw makeError(X`host-shell ${q(field)} must not contain NUL bytes`);
  }
};
harden(requireNoNul);

/**
 * Adapt a Node readable (a child's stdout / stderr) to an
 * `AsyncIterator<Uint8Array>` that **captures output from the moment the
 * process starts**, not lazily when a consumer first pulls.
 *
 * A lazy adapter (e.g. `@endo/stream-node`'s `makeNodeReader`) only reads
 * the pipe once the remote exo-stream consumer drives it.  A fast command
 * such as `echo` produces its whole output and exits during the CapTP
 * round-trip it takes the consumer to attach, and that buffered output is
 * lost.  Attaching the `data` listener eagerly here moves every chunk into
 * an in-memory queue at production time, so the consumer drains the queue
 * whenever it attaches.  Backpressure is preserved by pausing the source
 * once the queue is deep and resuming as the consumer catches up.
 *
 * @param {import('node:stream').Readable} source
 * @param {(byteLength: number) => void} [onBytes] - notified of each
 *   captured chunk's length, so the caller can enforce an output cap.
 * @returns {AsyncIterableIterator<Uint8Array>}
 */
const makeEagerByteReader = (source, onBytes) => {
  /** @type {Uint8Array[]} */
  const queue = [];
  let queuedBytes = 0;
  let paused = false;
  let ended = false;
  /** @type {Error | undefined} */
  let failure;
  /** @type {(() => void) | undefined} */
  let wakeWaiter;

  const wake = () => {
    const resume = wakeWaiter;
    wakeWaiter = undefined;
    if (resume !== undefined) {
      resume();
    }
  };

  source.on('data', chunk => {
    // Copy out of Node's pooled Buffer: `new Uint8Array(buffer)` clones the
    // bytes into a fresh ArrayBuffer, so a later reuse of the pool cannot
    // corrupt a queued chunk.
    const bytes = new Uint8Array(/** @type {Buffer} */ (chunk));
    queue.push(bytes);
    queuedBytes += bytes.length;
    if (onBytes !== undefined) {
      onBytes(bytes.length);
    }
    if (queuedBytes >= READ_HIGH_WATER_BYTES && !paused) {
      source.pause();
      paused = true;
    }
    wake();
  });
  source.once('end', () => {
    ended = true;
    wake();
  });
  source.once('error', error => {
    failure = /** @type {Error} */ (error);
    ended = true;
    wake();
  });

  /** @type {AsyncIterableIterator<Uint8Array>} */
  const reader = {
    async next() {
      for (;;) {
        if (queue.length > 0) {
          const value = /** @type {Uint8Array} */ (queue.shift());
          queuedBytes -= value.length;
          if (paused && queuedBytes < READ_HIGH_WATER_BYTES) {
            source.resume();
            paused = false;
          }
          return harden({ done: false, value });
        }
        if (failure !== undefined) {
          throw failure;
        }
        if (ended) {
          return harden({ done: true, value: undefined });
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise(resolve => {
          wakeWaiter = () => resolve(undefined);
        });
      }
    },
    async return() {
      source.destroy();
      ended = true;
      return harden({ done: true, value: undefined });
    },
    [Symbol.asyncIterator]() {
      return reader;
    },
  };
  return reader;
};
harden(makeEagerByteReader);

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
 * Each of `stdin` / `stdout` / `stderr` defaults to `'pipe'` (bridged over
 * CapTP).  Set one to `'ignore'` when the caller is not interested: the fd
 * is wired straight to the null device, so the host neither creates a pipe
 * nor buffers anything, the child never blocks on an unread stream, and
 * `'ignore'`d stdin gives the child an immediate EOF.  The matching
 * accessor then throws, since there is nothing to bridge.
 *
 * `exit()` resolves when the **process** terminates (Node's `'exit'`
 * event), not when its stdio has fully drained (`'close'`).  Decoupling
 * the two means a stdio stream the caller never consumes — or a pipe an
 * orphaned grandchild keeps open — cannot wedge the exit-status promise.
 * Captured output remains readable from the in-memory queue after exit.
 * To avoid backpressuring (and so blocking) the child, drain or
 * `return()` every stream you open, set `maxOutputBytes` as a hard cap,
 * or mark streams you don't want as `'ignore'`.
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
    timeoutMs,
    maxOutputBytes,
    killGraceMs = KILL_GRACE_MS,
    stdin = 'pipe',
    stdout = 'pipe',
    stderr = 'pipe',
  } = options;

  if (typeof command !== 'string' || command.length === 0) {
    throw makeError(
      X`host-shell requires a non-empty command, got ${q(command)}`,
    );
  }
  requireNoNul(command, 'command');
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) {
    throw makeError(X`host-shell args must be an array of strings`);
  }
  for (const arg of args) {
    requireNoNul(arg, 'args entry');
  }
  // With a shell enabled, Node splices `args` into the `sh -c` string
  // *unquoted*, so an arg's shell metacharacters would be interpreted as
  // script — defeating the structured-argv injection guarantee.  Refuse
  // the combination: in shell mode the whole command line belongs in
  // `command`.
  if (shell && args.length > 0) {
    throw makeError(
      X`host-shell cannot combine a shell with args; put the full command line in command (args are spliced into the shell string unquoted)`,
    );
  }
  if (cwd !== undefined) {
    if (typeof cwd !== 'string') {
      throw makeError(X`host-shell cwd must be a string, got ${q(cwd)}`);
    }
    requireNoNul(cwd, 'cwd');
  }

  const stdinPiped = stdin === 'pipe';
  const stdoutPiped = stdout === 'pipe';
  const stderrPiped = stderr === 'pipe';

  const child = spawn(command, [...args], {
    cwd,
    env: childEnv,
    // false (default): structured argv, no shell, no injection.
    // true / path: opt-in shell interpretation for pipelines & chaining.
    shell,
    // 'pipe' bridges the fd over CapTP; 'ignore' wires it to the null
    // device so the host never buffers a stream the caller doesn't want.
    stdio: [stdin, stdout, stderr],
  });

  /** @type {import('@endo/promise-kit').PromiseKit<ExitStatus>} */
  const exitKit = makePromiseKit();
  // The exit status may never be awaited by the caller (fire-and-forget
  // commands); register a no-op handler so a rejection (e.g. ENOENT) does
  // not surface as an unhandled rejection at the worker level.
  exitKit.promise.catch(() => {});

  let settled = false;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let killTimer;
  const disarmTimers = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (killTimer !== undefined) {
      clearTimeout(killTimer);
      killTimer = undefined;
    }
  };

  // Terminate a still-running child: SIGTERM first, then escalate to
  // SIGKILL after a grace period so a child that ignores or traps SIGTERM
  // is still reaped rather than hanging the formula forever.  No-ops on an
  // already-dead child.  Used by the timeout and output-cap guards and
  // reused for cancellation below.
  const terminate = () => {
    if (child.exitCode !== null || child.killed) {
      return;
    }
    child.kill('SIGTERM');
    if (killTimer === undefined) {
      killTimer = setTimeout(() => {
        if (child.exitCode === null) {
          child.kill('SIGKILL');
        }
      }, killGraceMs);
      // Don't let the escalation timer keep the worker's event loop alive.
      // Trade-off: if the worker's loop were to drain in the grace window
      // (no other handles), the SIGKILL could be skipped — acceptable here
      // because the worker normally outlives the child it is hosting.
      if (typeof killTimer.unref === 'function') {
        killTimer.unref();
      }
    }
  };

  child.once('error', error => {
    if (settled) return;
    settled = true;
    disarmTimers();
    exitKit.reject(error);
  });
  // Resolve on 'exit' (process termination), not 'close' (all stdio
  // drained): an unconsumed or orphan-held pipe must not block the status.
  child.once('exit', (code, signal) => {
    if (settled) return;
    settled = true;
    disarmTimers();
    exitKit.resolve(harden({ code, signal }));
  });

  if (timeoutMs !== undefined) {
    timer = setTimeout(terminate, timeoutMs);
    // Don't let a pending timeout keep the worker's event loop alive.
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  }

  // Enforce the optional total-output cap across stdout + stderr: a
  // runaway producer is terminated rather than allowed to grow the heap
  // (when a consumer is attached) or block on a full pipe (when not).
  // The cap is approximate: a chunk is counted only after it is queued, so
  // up to one pipe-sized read (~64 KiB) past the limit may be buffered
  // before the SIGTERM lands.  That overshoot is bounded by a single read.
  let outputBytes = 0;
  /** @type {((byteLength: number) => void) | undefined} */
  const onBytes =
    maxOutputBytes === undefined
      ? undefined
      : byteLength => {
          outputBytes += byteLength;
          if (outputBytes > maxOutputBytes) {
            terminate();
          }
        };

  // A worker formula is cancelled when its dependencies die or the host
  // revokes it; tear the child down rather than orphaning a subprocess.
  // `context` arrives as an opaque daemon capability; narrow it to the one
  // method this formula uses.
  if (context !== undefined) {
    E(/** @type {{ whenCancelled: () => Promise<unknown> }} */ (context))
      .whenCancelled()
      .catch(() => {
        terminate();
      });
  }

  // A 'pipe' fd is a stream on the child; an 'ignore' fd is null (it went
  // to the null device).  Bridge only the piped streams; a piped fd that
  // is unexpectedly null is a regression, so fail loudly.
  const { stdin: childStdin, stdout: childStdout, stderr: childStderr } = child;
  if (
    (stdinPiped && childStdin === null) ||
    (stdoutPiped && childStdout === null) ||
    (stderrPiped && childStderr === null)
  ) {
    throw makeError(X`host-shell stdio pipes were not available`);
  }

  const stdinWriter =
    stdinPiped && childStdin !== null
      ? bytesWriterFromIterator(makeNodeWriter(childStdin), {
          buffer: STREAM_BUFFER,
        })
      : undefined;
  const stdoutReader =
    stdoutPiped && childStdout !== null
      ? bytesReaderFromIterator(makeEagerByteReader(childStdout, onBytes), {
          buffer: STREAM_BUFFER,
        })
      : undefined;
  const stderrReader =
    stderrPiped && childStderr !== null
      ? bytesReaderFromIterator(makeEagerByteReader(childStderr, onBytes), {
          buffer: STREAM_BUFFER,
        })
      : undefined;

  return makeExo('ShellProcess', ShellProcessInterface, {
    /**
     * The process's standard input as an exo-stream byte writer.  Drain
     * it from the initiator with `iterateBytesWriter`; `return()` closes
     * (EOFs) the child's stdin.  Throws if stdin was configured `'ignore'`.
     */
    stdin() {
      if (stdinWriter === undefined) {
        throw makeError(X`host-shell stdin is not piped (configured 'ignore')`);
      }
      return stdinWriter;
    },

    /**
     * The process's standard output as an exo-stream byte reader.  Drain
     * it from the initiator with `iterateBytesReader`.  Throws if stdout
     * was configured `'ignore'`.
     */
    stdout() {
      if (stdoutReader === undefined) {
        throw makeError(
          X`host-shell stdout is not piped (configured 'ignore')`,
        );
      }
      return stdoutReader;
    },

    /**
     * The process's standard error as an exo-stream byte reader.  Throws
     * if stderr was configured `'ignore'`.
     */
    stderr() {
      if (stderrReader === undefined) {
        throw makeError(
          X`host-shell stderr is not piped (configured 'ignore')`,
        );
      }
      return stderrReader;
    },

    /**
     * Resolves once the process has terminated (independent of whether
     * its stdio streams have been drained).  `code` is the numeric exit
     * code (null if the process was killed by a signal); `signal` is the
     * terminating signal name (null on a normal exit).  Rejects if the
     * process could not be spawned.
     *
     * @returns {Promise<ExitStatus>}
     */
    exit() {
      return exitKit.promise;
    },

    /**
     * Deliver a POSIX signal to the process.  The parameter type matches
     * the `ShellProcessInterface` guard (`string | number`); narrow to
     * Node's signal union at the `child.kill` boundary.
     *
     * @param {string | number} [signal]
     * @returns {boolean} whether the signal was delivered
     */
    kill(signal = 'SIGTERM') {
      return child.kill(/** @type {NodeJS.Signals | number} */ (signal));
    },

    /**
     * @returns {number | undefined} the OS process id
     */
    pid() {
      return child.pid;
    },

    help() {
      return 'A running host process. stdin() is an exo-stream byte writer; stdout() and stderr() are exo-stream byte readers; exit() resolves { code, signal } when the process terminates; kill(signal?) signals the process (default SIGTERM); pid() is the OS process id.';
    },
  });
};
harden(makeShellProcess);

/**
 * Parse an optional JSON-array-of-strings field from a formula `env`.  A
 * formula `env` is a flat `Record<string, string>`, so a string vector is
 * carried as a JSON array.
 *
 * @param {string | undefined} value
 * @param {string} field - the `env` key, used in error messages.
 * @returns {string[] | undefined}
 */
const parseStringArray = (value, field) => {
  if (value === undefined) {
    return undefined;
  }
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw makeError(
      X`host-shell env.${field} must be a JSON array: ${q(
        /** @type {Error} */ (error).message,
      )}`,
    );
  }
  if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string')) {
    throw makeError(X`host-shell env.${field} must be a JSON array of strings`);
  }
  return parsed;
};
harden(parseStringArray);

/**
 * Parse the optional JSON `args` field from a formula `env` into a
 * structured argv.
 *
 * @param {string | undefined} value
 * @returns {string[] | undefined}
 */
export const parseArgs = value => parseStringArray(value, 'args');
harden(parseArgs);

/**
 * Parse the optional JSON `extraEnvKeys` field from a formula `env` into a
 * list of worker env variable names to pass through to the child.
 *
 * @param {string | undefined} value
 * @returns {string[] | undefined}
 */
export const parseEnvKeys = value => parseStringArray(value, 'extraEnvKeys');
harden(parseEnvKeys);

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
 * Parse an optional stdio-disposition field (`stdin` / `stdout` /
 * `stderr`) from a formula `env`.  Absent or `'pipe'` bridges the stream
 * over CapTP; `'ignore'` wires the fd to the null device so the host does
 * not buffer it.
 *
 * @param {string | undefined} value
 * @param {string} field
 * @returns {'pipe' | 'ignore'}
 */
export const parseStdio = (value, field) => {
  if (value === undefined || value === 'pipe') {
    return 'pipe';
  }
  if (value === 'ignore') {
    return 'ignore';
  }
  throw makeError(
    X`host-shell env.${field} must be 'pipe' or 'ignore', got ${q(value)}`,
  );
};
harden(parseStdio);

/**
 * Parse the optional JSON `processEnv` field from a formula `env` into a
 * flat object of override variables.  A formula `env` is itself a flat
 * `Record<string, string>`, so a richer child environment is carried as
 * a JSON-encoded object.  This only validates and parses; merging onto a
 * base environment is {@link buildChildEnv}'s job.
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
  // Screen for NUL here so a bad value fails with the structured boundary
  // error rather than a raw `ERR_INVALID_ARG_VALUE` from `spawn`.
  for (const [key, entry] of Object.entries(parsed)) {
    requireNoNul(key, 'processEnv key');
    requireNoNul(entry, 'processEnv value');
  }
  return parsed;
};
harden(parseProcessEnv);

/**
 * Build the child's environment from the worker's, returning a fresh,
 * **extensible** plain object — deliberately not hardened, because Node's
 * `spawn` writes coverage-injection variables (e.g. `NODE_V8_COVERAGE`)
 * straight into the `env` object it is handed, which throws on a frozen
 * one.  The object is ephemeral (consumed by the spawn, never stored), so
 * leaving it unhardened widens no authority.
 *
 * By default the child inherits only {@link SAFE_ENV_KEYS} from the
 * worker, so daemon secrets are not exposed to an arbitrary command.
 * `extraEnvKeys` names additional worker variables to pass through (e.g.
 * `SSH_AUTH_SOCK`, `XDG_*`) without opening the floodgates — the targeted
 * alternative to `inheritEnv` (`true` / `'true'`), which inherits the full
 * worker environment for trusted commands that need it.  Parsed
 * `processEnv` overrides are layered on top of whichever base.
 *
 * @param {object} [options]
 * @param {string} [options.processEnv] - JSON object of override variables.
 * @param {boolean | string} [options.inheritEnv] - inherit the full
 *   worker environment instead of the safe allowlist.
 * @param {string[]} [options.extraEnvKeys] - extra worker env keys to
 *   allow through (ignored when `inheritEnv` is set).
 * @returns {Record<string, string>}
 */
export const buildChildEnv = ({
  processEnv,
  inheritEnv,
  extraEnvKeys = [],
} = {}) => {
  const overrides = parseProcessEnv(processEnv);
  const inherit = inheritEnv === true || inheritEnv === 'true';
  if (inherit) {
    // `process.env` values are always strings at runtime (absent keys are
    // simply not enumerated), so the spread yields the extensible string
    // record `spawn` expects; assert that at the boundary.
    return /** @type {Record<string, string>} */ ({
      ...process.env,
      ...overrides,
    });
  }
  /** @type {Record<string, string>} */
  const base = {};
  for (const key of [...SAFE_ENV_KEYS, ...extraEnvKeys]) {
    const value = process.env[key];
    if (value !== undefined) {
      base[key] = value;
    }
  }
  return { ...base, ...overrides };
};
harden(buildChildEnv);

/**
 * Parse an optional positive-integer field (e.g. `timeoutMs`,
 * `maxOutputBytes`) from a formula `env`.  Returns `undefined` when the
 * field is absent.
 *
 * @param {string | undefined} value
 * @param {string} field
 * @returns {number | undefined}
 */
export const parsePositiveInteger = (value, field) => {
  if (value === undefined) {
    return undefined;
  }
  // Require plain decimal digits (no hex, exponent, sign, decimal point, or
  // surrounding whitespace that `Number` would silently accept), then a
  // safe positive integer (no precision loss above `MAX_SAFE_INTEGER`).
  const parsed = /^[0-9]+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw makeError(
      X`host-shell env.${field} must be a positive integer, got ${q(value)}`,
    );
  }
  return parsed;
};
harden(parsePositiveInteger);
