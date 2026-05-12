// @ts-check
/* global setTimeout, clearTimeout */
/* eslint-disable no-continue, no-await-in-loop */

/**
 * Command Tools Module
 *
 * Provides a factory for creating command-execution tools with optional
 * program restriction and arbitrary policy enforcement.
 *
 * Every tool accepts `args: string[]`.  When `program` is set, it is
 * implicitly prepended — the caller only supplies sub-command arguments.
 * Without a `program`, the first element of `args` is the executable.
 *
 * Policy functions run *before* execution and may reject or rewrite the
 * resolved command string.
 *
 * ## Example: program-specific tool
 *
 * ```js
 * // A git-only tool.  The caller supplies git sub-command arguments;
 * // `"git"` is always prepended.
 * const git = makeCommandTool({
 *   name: 'git',
 *   program: 'git',
 *   description: 'Executes git commands.',
 *   allowPath: true,
 *   policies: [],
 * });
 * ```
 *
 * The actual process-execution engine is pluggable via the
 * `spawner` option (see {@link makeHostSpawner} and the sandbox
 * spawner in `./sandbox-spawner.js`).  The timeout / kill /
 * output-accumulation loop lives here in `makeCommandTool` so it
 * stays uniform regardless of spawner.
 */

import { resolve, relative } from 'path';

import harden from '@endo/harden';
import { M } from '@endo/patterns';
import { makeTool } from './common.js';
import { makeHostSpawner } from './spawner.js';

/** @import { Spawner } from './spawner.js' */

// ---------------------------------------------------------------------------
// Policy-item types
// ---------------------------------------------------------------------------

/**
 * A rejected-pattern entry: either a bare `RegExp` or an object with a
 * `pattern` and an optional human-readable `reason` that is surfaced in the
 * error message to guide agents toward the correct tool.
 *
 * @typedef {RegExp | { pattern: RegExp, reason?: string }} RejectPatternEntry
 */

/**
 * A rejected-flag entry: either a bare flag string or an object with a
 * `flag` and an optional `reason`.
 *
 * @typedef {string | { flag: string, reason?: string }} RejectFlagEntry
 */

// ---------------------------------------------------------------------------
// Built-in policies
// ---------------------------------------------------------------------------

/**
 * Reject commands that match any of the provided regular expressions.
 *
 * Each entry may be a plain `RegExp` or an object
 * `{ pattern: RegExp, reason?: string }`.  When a `reason` is provided it
 * is included in the error message so that an agent can self-correct.
 *
 * @param {RejectPatternEntry[]} entries
 */
const rejectPatterns = entries => {
  /** @param {string[]} args */
  const policy = args => {
    for (const entry of entries) {
      const pattern = entry instanceof RegExp ? entry : entry.pattern;
      const reason = entry instanceof RegExp ? undefined : entry.reason;
      if (args.some(arg => pattern.test(arg))) {
        const message = reason
          ? `Command contains a forbidden pattern: ${reason}`
          : 'Command contains a forbidden pattern';
        throw new Error(message);
      }
    }
  };
  return harden(policy);
};
harden(rejectPatterns);

/**
 * Reject commands that contain any of the listed flag strings.
 *
 * Each entry may be a bare flag string (e.g. `'-i'`) or an object
 * `{ flag: string, reason?: string }`.  When a `reason` is supplied it
 * appears in the error message.
 *
 * Useful for blocking specific options like `-i` or `--in-place` on `sed`.
 *
 * @param {RejectFlagEntry[]} entries
 * @returns {(cmd: string) => void}
 */
const rejectFlags = entries => {
  /** @type {Map<string, string | undefined>} */
  const forbidden = new Map();
  for (const entry of entries) {
    if (typeof entry === 'string') {
      forbidden.set(entry, undefined);
    } else {
      forbidden.set(entry.flag, entry.reason);
    }
  }
  harden(forbidden);

  /** @param {string} cmd */
  const policy = cmd => {
    // Naïve split — intentionally simple so it stays predictable.
    const tokens = cmd.split(/\s+/);
    for (const token of tokens) {
      if (forbidden.has(token)) {
        const reason = forbidden.get(token);
        const message = reason
          ? `Forbidden flag: ${token} — ${reason}`
          : `Forbidden flag: ${token}`;
        throw new Error(message);
      }
    }
  };
  return harden(policy);
};
harden(rejectFlags);

/**
 * Ensure that every file-path-like token in the command resolves under
 * `root`.  A token is considered path-like when it contains a `/` or
 * starts with `.`.
 *
 * @param {string} root - The root directory paths must stay within.
 * @returns {(cmd: string) => void}
 */
const enforcePath = root => {
  const resolvedRoot = resolve(root);

  /** @param {string} cmd */
  const policy = cmd => {
    const tokens = cmd.split(/\s+/);
    for (const token of tokens) {
      // Skip flags.
      if (token.startsWith('-')) continue;
      // Only check path-like tokens.
      if (!token.includes('/') && !token.startsWith('.')) continue;

      const resolved = resolve(resolvedRoot, token);
      const rel = relative(resolvedRoot, resolved);
      if (rel.startsWith('..') || resolve(rel) === rel) {
        throw new Error(`Path escapes root (${resolvedRoot}): ${token}`);
      }
    }
  };
  return harden(policy);
};
harden(enforcePath);

// ---------------------------------------------------------------------------
// Default dangerous-command patterns (used by the bare "bash" tool)
// ---------------------------------------------------------------------------

/** @type {RejectPatternEntry[]} */
const DANGEROUS_PATTERNS = harden([
  {
    pattern: /rm\s+-rf\s+[^*]$/,
    reason: 'use the removeDirectory tool instead',
  },
  /chmod\s+777\s+/,
  /chown\s+\d+\s+/,
  /sudo\s+/,
  /pkill\s+-9\s+/,
  /kill\s+9\s+/,
  /mv\s+\/[a-z]?\s+/,
  /mv\s+\/[^/]+\/[^/]+\s+\/\s+/,
]);

// ---------------------------------------------------------------------------
// Process supervision (timeout / kill / output accumulation)
// ---------------------------------------------------------------------------

/**
 * Drain an async-iterable byte stream into a UTF-8 string.  Returns
 * an empty string when the stream is null / undefined (i.e. the
 * spawner did not capture this channel).
 *
 * Errors raised by the iterable are swallowed: a process kill mid-
 * stream typically surfaces as an `EPIPE` / read-after-close error
 * the caller does not need to distinguish from clean EOF.
 *
 * @param {AsyncIterable<Uint8Array> | null | undefined} stream
 * @returns {Promise<string>}
 */
const drainToString = async stream => {
  await null;
  if (stream === null || stream === undefined) return '';
  const decoder = new TextDecoder('utf-8');
  let acc = '';
  try {
    for await (const chunk of stream) {
      acc += decoder.decode(chunk, { stream: true });
    }
    acc += decoder.decode();
  } catch {
    // ignore: the process may have been killed mid-stream.
  }
  return acc;
};

/**
 * Supervise a {@link ProcessLike} until it exits, draining its
 * stdout / stderr and enforcing a soft-kill timeout.  This loop is
 * deliberately spawner-agnostic so the host and sandbox spawners can
 * share it.
 *
 * @param {object} args
 * @param {string} args.name
 * @param {import('./spawner.js').ProcessLike} args.proc
 * @param {number} args.timeoutMs
 * @param {boolean} args.allowPath
 * @param {string} args.cwd
 * @param {string} args.fullCommand
 * @returns {Promise<{success: boolean, command: string, stdout: string, stderr: string, exitCode: number, path?: string}>}
 */
const runProcess = async ({
  name,
  proc,
  timeoutMs,
  allowPath,
  cwd,
  fullCommand,
}) => {
  let killed = false;
  const timer = setTimeout(() => {
    killed = true;
    void proc.kill('SIGTERM');
  }, timeoutMs);

  let stdout = '';
  let stderr = '';
  /** @type {{ code: number | null; signal: string | null }} */
  let status = { code: null, signal: null };
  try {
    [stdout, stderr, status] = await Promise.all([
      drainToString(proc.stdout ?? undefined),
      drainToString(proc.stderr ?? undefined),
      proc.wait(),
    ]);
  } finally {
    clearTimeout(timer);
  }

  const trimmedStdout = stdout.trim();
  const trimmedStderr = stderr.trim();

  if (killed) {
    const err = new Error(`${name} timed out after ${timeoutMs}ms`);
    // Attach the same diagnostic fields the non-zero-exit path uses so
    // callers (and `makeCommandTool.execute`'s error wrapper below) can
    // surface partial stdout / stderr captured before the kill.
    Object.assign(err, {
      command: fullCommand,
      stdout: trimmedStdout,
      stderr: trimmedStderr,
      exitCode: status.code ?? null,
      signal: status.signal,
    });
    throw err;
  }

  // Non-zero exits are *data*, not errors — see TADA/60.  Many command-
  // line tools use the exit code to answer yes/no questions (`grep` for
  // "did this file contain the pattern", `test -f` for "does this path
  // exist", `diff` for "do these files differ").  Throwing here would
  // strand the model with an opaque error and no way to react to the
  // legitimate negative result.  The schema already advertises both
  // `success` and `exitCode` — honour the contract.
  //
  // Only spawner-init failures (program-not-found, factory reject) and
  // the timeout-kill branch above still throw; those *are* errors the
  // caller cannot reason about as data.
  const exitCode = status.code ?? -1;
  /** @type {{success: boolean, command: string, stdout: string, stderr: string, exitCode: number, path?: string}} */
  const out = {
    success: exitCode === 0,
    command: fullCommand,
    stdout: trimmedStdout,
    stderr: trimmedStderr,
    exitCode,
  };
  if (allowPath) {
    out.path = cwd;
  }
  return out;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * @callback Policy
 * A policy function receives the fully-resolved command string and may
 * throw to reject it.  It is called *before* execution.
 * @param {string[]} command - The complete command that will be executed.
 * @returns {void}
 */

/**
 * @typedef {object} CommandToolOptions
 * @property {string}    name              - Tool / interface name.
 * @property {string}    [program]         - Fixed program prefix.  When set
 *   it is implicitly prepended to `args`.
 * @property {string}    [description]     - One-line description for help().
 * @property {boolean}   [allowPath]       - Accept a `path` (cwd) option
 *   (default: false).
 * @property {Policy[]}  [policies]        - Validation policies to apply
 *   before execution.
 * @property {number}    [defaultTimeout]  - Default timeout in ms
 *   (default: 30 000).
 * @property {string}    [searchPath]      - $PATH override (only honoured
 *   by the default host spawner; ignored when an explicit `spawner` is
 *   supplied).
 * @property {boolean}   [shell]           - whether to execute thru a shell
 * @property {Spawner}   [spawner]         - Process-execution engine.
 *   Defaults to a freshly-built host spawner (see
 *   {@link makeHostSpawner}).  Pass a sandbox spawner to run the tool
 *   inside an `@endo/sandbox` slice.
 * @property {string}    [sliceWorkspacePath] - When the `spawner` routes
 *   this tool through a sandbox slice, the slice-internal mount path
 *   where the workspace is visible (e.g. `/workspace`).  Threaded into
 *   `help()` so the tool-level docs mention the slice path the model
 *   should use rather than the host workspace path.  Avoid hard-coding
 *   the path here — pass it down from the slice-mint site so the same
 *   wire feeds both the system prompt and the tool descriptions.
 */

/**
 * Create a command-execution tool via `makeTool`.
 *
 * @param {CommandToolOptions} options
 * @returns {import('./common.js').makeTool extends (n: string, s: infer S) => infer R ? R : never}
 */
const makeCommandTool = ({
  name,
  program,
  description,
  allowPath = false,
  policies = [],
  defaultTimeout = 30_000,
  searchPath,
  shell = false,
  spawner = makeHostSpawner(
    searchPath !== undefined ? { searchPath } : undefined,
  ),
  sliceWorkspacePath,
}) => {
  const hasProgram = program !== undefined;

  // -- schema pieces --------------------------------------------------------

  const required = { args: M.arrayOf(M.string()) };

  /** @type {Record<string, any>} */
  const optional = { timeout_ms: M.number() };
  if (allowPath) {
    optional.path = M.string();
  }

  /** @type {Record<string, any>} */
  const returnShape = {
    success: M.boolean(),
    command: M.string(),
    stdout: M.string(),
    stderr: M.string(),
    exitCode: M.number(),
  };
  if (allowPath) {
    returnShape.path = M.string();
  }

  return makeTool(name, {
    *help() {
      if (description) {
        yield description;
      } else if (hasProgram) {
        yield `Executes ${program} commands.`;
      } else {
        yield 'Executes shell commands.';
      }
      if (sliceWorkspacePath !== undefined) {
        // The model's workspace path inside the slice is not the host
        // directory the system prompt mentions as the working
        // directory — the host workspace is bind-mounted to this fixed
        // path.  Surfacing the slice path here (in addition to the
        // runtime-info section) makes the tool-level docs self-
        // sufficient and avoids the host-path-into-bash failure mode
        // described in TODO/62.
        yield '';
        yield `**Workspace path:** This tool runs inside a sandbox slice; the workspace is mounted at \`${sliceWorkspacePath}\`.  Use that path (not the host workspace directory) when referencing the workspace from a shell command.`;
      }
      yield '';
      yield '**Parameters:**';
      yield `- \`args\`: ${hasProgram ? `Arguments for \`${program}\`` : 'Command and arguments'} (required, string[])`;
      if (allowPath) {
        yield '- `path`: Working directory (optional, default: current directory)';
      }
      yield `- \`timeout_ms\`: Timeout in milliseconds (optional, default: ${defaultTimeout})`;
      yield '';
      yield '**Example:**';
      yield '```';
      if (hasProgram) {
        yield `${name}({ args: ["--version"] })`;
      } else {
        yield `${name}({ args: ["echo", "hello"] })`;
      }
      yield '```';
    },

    schema: M.call(M.splitRecord(required, optional)).returns(returnShape),

    /**
     * @param {object} opts
     * @param {string[]} opts.args
     * @param {number} [opts.timeout_ms]
     * @param {string} [opts.path]
     * @returns {Promise<{success: boolean, command: string, stdout: string, stderr: string, exitCode: number, path?: string}>}
     */
    async execute(opts) {
      const {
        args,
        timeout_ms: timeoutMs = defaultTimeout,
        path: cwd = '.',
      } = opts;

      // Run all policies.
      for (const policy of policies) {
        policy(args);
      }

      // Path validation when enabled.
      if (allowPath) {
        if (cwd.includes('..') || cwd.startsWith('/')) {
          throw new Error('Invalid path: directory traversal not allowed');
        }
      }

      // Build the full command: when a program is configured, prepend it.
      const allArgs = hasProgram ? [program, ...args] : args;
      const fullCommand = JSON.stringify(allArgs);

      const spawnerOpts = {
        ...(allowPath ? { cwd } : {}),
        shell,
      };

      try {
        const proc = await spawner(allArgs, spawnerOpts);
        return await runProcess({
          name,
          proc,
          timeoutMs,
          allowPath,
          cwd,
          fullCommand,
        });
      } catch (err) {
        const cast =
          /** @type {Error & { stderr?: string, stdout?: string, exitCode?: number, command?: string }} */ (
            err
          );
        // Compose a diagnostic message that surfaces stderr (and a
        // truncated stdout when stderr is empty) so that callers — the
        // dev-repl's red `✗ failed:` line and chatlog renderers — show
        // *why* the command failed.  Without this every non-zero exit
        // collapses to an opaque `Command failed with exit code N`.
        const STDERR_BUDGET = 2048;
        const STDOUT_BUDGET = 2048;
        /**
         * @param {string} text
         * @param {number} budget
         */
        const clip = (text, budget) =>
          text.length > budget
            ? `${text.slice(0, budget)}… (truncated, ${text.length - budget} more bytes)`
            : text;
        const parts = [`${name} execution failed: ${cast.message}`];
        if (cast.stderr) {
          parts.push(`stderr: ${clip(cast.stderr, STDERR_BUDGET)}`);
        } else if (cast.stdout) {
          // Some failing commands write their diagnostic to stdout
          // (e.g. `npm run` indirected through a script).  Surface that
          // when stderr was empty so the model still has a clue.
          parts.push(`stdout: ${clip(cast.stdout, STDOUT_BUDGET)}`);
        }
        const wrapped = new Error(parts.join('\n'));
        // Forward the structured fields so a programmatic caller can
        // still inspect them after the wrap.
        if (cast.exitCode !== undefined) {
          Object.assign(wrapped, {
            code: cast.exitCode,
            exitCode: cast.exitCode,
            stdout: cast.stdout,
            stderr: cast.stderr,
            command: cast.command,
          });
        }
        throw wrapped;
      }
    },
  });
};
harden(makeCommandTool);

// ---------------------------------------------------------------------------
// Pre-built tools
// ---------------------------------------------------------------------------

/**
 * Build a fresh `exec` tool — a general-purpose, non-shell system
 * command tool with dangerous-pattern blocking.  Accepts an optional
 * spawner override so a sandbox-aware caller (e.g. the daemon-hosted
 * genie's tool registry) can route execution through a slice.
 *
 * @param {{ spawner?: Spawner, sliceWorkspacePath?: string }} [options]
 */
const makeExecTool = ({ spawner, sliceWorkspacePath } = {}) =>
  makeCommandTool({
    name: 'exec',
    description: [
      'Runs a system command (ls, grep, find, cat, curl, etc.).',
      'Use for general tasks not covered by other tools.',
      'NOTE: does not execute through a shell',
      '',
      'Returns `{ success, exitCode, stdout, stderr, command }`.',
      'A non-zero `exitCode` is reported as data with `success: false` — many',
      'tools answer yes/no questions through the exit code (`grep` exits 1',
      'when there is no match; `test -f` exits 1 when the path is missing;',
      '`diff` exits 1 when files differ).  Inspect `exitCode`, `stdout`, and',
      '`stderr` to decide what the result means; only an actual error (the',
      'program could not be launched, or the command timed out) causes the',
      'tool call itself to fail.',
    ].join('\n'),
    policies: [rejectPatterns(DANGEROUS_PATTERNS)],
    ...(spawner ? { spawner } : {}),
    ...(sliceWorkspacePath !== undefined ? { sliceWorkspacePath } : {}),
  });
harden(makeExecTool);

/**
 * Build a fresh `bash` tool — a general-purpose shell tool with
 * dangerous-pattern blocking.  Accepts an optional spawner override
 * (see {@link makeExecTool}).
 *
 * @param {{ spawner?: Spawner, sliceWorkspacePath?: string }} [options]
 */
const makeBashTool = ({ spawner, sliceWorkspacePath } = {}) =>
  makeCommandTool({
    name: 'bash',
    description: [
      'Runs a shell command (ls, grep, find, cat, curl, etc.).',
      'Use for general tasks not covered by other tools.',
      '',
      'Returns `{ success, exitCode, stdout, stderr, command }`.',
      'A non-zero `exitCode` is reported as data with `success: false` — many',
      'tools answer yes/no questions through the exit code (`grep` exits 1',
      'when there is no match; `test -f` exits 1 when the path is missing;',
      '`diff` exits 1 when files differ).  Inspect `exitCode`, `stdout`, and',
      '`stderr` to decide what the result means; only an actual error (the',
      'program could not be launched, or the command timed out) causes the',
      'tool call itself to fail.',
    ].join('\n'),
    policies: [rejectPatterns(DANGEROUS_PATTERNS)],
    shell: true,
    ...(spawner ? { spawner } : {}),
    ...(sliceWorkspacePath !== undefined ? { sliceWorkspacePath } : {}),
  });
harden(makeBashTool);

/** Default host-spawner-backed exec tool. */
const exec = makeExecTool();
harden(exec);

/** Default host-spawner-backed bash tool. */
const bash = makeBashTool();
harden(bash);

export {
  makeCommandTool,
  makeBashTool,
  makeExecTool,
  bash,
  exec,
  rejectPatterns,
  rejectFlags,
  enforcePath,
};
