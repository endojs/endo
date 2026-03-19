// @ts-check
/* global process, setTimeout, clearTimeout */
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
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import { join, resolve, relative } from 'path';

import { M } from '@endo/patterns';
import { makeTool } from './common.js';

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
 * @property {string}    [searchPath]      - $PATH override
 * @property {boolean}   [shell]           - whether to execute thru a shell
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
  searchPath = process.env.PATH || '',
  shell = false,
}) => {
  /**
   * @param {string} prog
   */
  const whichProgram = async prog => {
    const isWin = process.platform === 'win32';
    const pathDirs = searchPath.split(isWin ? ';' : ':');
    for (const dir of pathDirs) {
      if (!dir) continue;
      const candidate = join(dir, prog);
      try {
        const stats = await fs.promises.stat(candidate);
        // eslint-disable-next-line no-bitwise
        if (isWin ? stats.isFile() : (stats.mode & 0o111) !== 0) {
          return candidate;
        }
      } catch {
        // not found in this dir
      }
    }
    return null;
  };

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

      // Resolve the executable
      const prog = program || args[0] || 'false';
      const exe = await whichProgram(prog);
      if (!exe) {
        throw new Error(`command not found: ${prog}`);
      }

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

      const spawnArgs = hasProgram ? args : args.slice(1);

      // Build the full command: when a program is configured, prepend it.
      const allArgs = hasProgram ? [program, ...args] : args;
      const fullCommand = JSON.stringify(allArgs);

      try {
        /** @type {Promise<{success: boolean, command: string, stdout: string, stderr: string, exitCode: number, path?: string}>} */
        // eslint-disable-next-line no-shadow
        const result = new Promise((resolve, reject) => {
          const child = spawn(exe, spawnArgs, {
            ...(allowPath ? { cwd } : {}),
            env: {
              ...process.env,
              PATH: process.env.PATH,
            },
            shell,
          });

          let stdout = '';
          let stderr = '';
          let killed = false;

          const timer = setTimeout(() => {
            killed = true;
            child.kill('SIGTERM');
          }, timeoutMs);

          child.stdout.on('data', chunk => {
            stdout += chunk;
          });

          child.stderr.on('data', chunk => {
            stderr += chunk;
          });

          child.on('error', err => {
            clearTimeout(timer);
            reject(err);
          });

          child.on('close', exitCode => {
            clearTimeout(timer);
            if (killed) {
              reject(new Error(`${name} timed out after ${timeoutMs}ms`));
              return;
            }
            if (exitCode !== 0) {
              const err = new Error(
                `Command failed with exit code ${exitCode}`,
              );
              // @ts-expect-error — attach extra fields for callers
              err.code = exitCode;
              reject(err);
              return;
            }
            const out = {
              success: true,
              command: fullCommand,
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              exitCode: 0,
            };
            if (allowPath) {
              out.path = cwd;
            }
            resolve(out);
          });
        });
        return result;
      } catch (err) {
        throw new Error(`${name} execution failed: ${err.message}`);
      }
    },
  });
};
harden(makeCommandTool);

// ---------------------------------------------------------------------------
// Pre-built tools
// ---------------------------------------------------------------------------

/**
 * General-purpose system command tool with dangerous-pattern blocking.
 */
const exec = makeCommandTool({
  name: 'exec',
  description: [
    'Runs a system command (ls, grep, find, cat, curl, etc.).',
    'Use for general tasks not covered by other tools.',
    'NOTE: does not execute through a shell',
  ].join('\n'),
  policies: [rejectPatterns(DANGEROUS_PATTERNS)],
});
harden(exec);

/**
 * General-purpose shell tool with dangerous-pattern blocking.
 */
const bash = makeCommandTool({
  name: 'bash',
  description: [
    'Runs a shell command (ls, grep, find, cat, curl, etc.).',
    'Use for general tasks not covered by other tools.',
  ].join('\n'),
  policies: [rejectPatterns(DANGEROUS_PATTERNS)],
  shell: true,
});
harden(bash);

export {
  makeCommandTool,
  bash,
  exec,
  rejectPatterns,
  rejectFlags,
  enforcePath,
};
