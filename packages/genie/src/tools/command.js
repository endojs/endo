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
 * ## Spawn channel
 *
 * When the optional `slice` parameter is supplied, every spawn is
 * routed through `E(slice).spawn(argv, opts)` — the `@endo/sandbox`
 * `SandboxHandle.spawn` surface — instead of the host's
 * `child_process.spawn`.  See
 * `TODO/35_endo_genie_sandbox_tool_spawn.md` and
 * `TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md`
 * § "Tool spawn channel" for the rationale: the slice confines `bash`
 * / `exec` / `git` to the workspace mount and the sandbox's network
 * profile, while the agent-visible result-shape contract
 * (`{ success, command, stdout, stderr, exitCode, path? }`) is
 * preserved.
 *
 * When `slice` is `undefined` the tool falls back to host-side
 * `child_process.spawn`, matching the pre-3.5a behaviour for
 * deployments (e.g. `dev-repl.js`, `self-boot.test.js`) that have not
 * minted a slice.
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

import { E } from '@endo/eventual-send';
import harden from '@endo/harden';
import { M } from '@endo/patterns';
import { makeTool } from './common.js';

/** @import { SandboxSlice } from './registry.js' */

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
harden(DANGEROUS_PATTERNS);

// ---------------------------------------------------------------------------
// Slice spawn helpers
// ---------------------------------------------------------------------------

/**
 * Drain a `reader-ref`-shaped `AsyncIterator<Uint8Array>` (the shape
 * `@endo/sandbox`'s `ProcessHandle.stdout` / `.stderr` returns; see
 * `packages/sandbox/src/factory.js#makeReaderExoFromAsyncIterable`)
 * into an array of `Uint8Array` chunks.  Iteration is driven by direct
 * `E(reader).next()` calls because remote refs do not expose
 * `Symbol.asyncIterator`.
 *
 * @param {any} reader
 * @param {Uint8Array[]} chunks
 * @returns {Promise<void>}
 */
const drainReaderRef = async (reader, chunks) => {
  await null;
  for (;;) {
    const r = /** @type {{done: boolean, value: Uint8Array}} */ (
      await E(reader).next()
    );
    if (r.done) return;
    if (r.value !== undefined) chunks.push(r.value);
  }
};

/**
 * Concatenate `Uint8Array` chunks and decode as UTF-8.  Mirrors the
 * effective behaviour of the host-spawn path (which accumulated
 * `Buffer` chunks via `+=`, implicitly toString'd as UTF-8) so the
 * agent-visible `stdout` / `stderr` strings round-trip identically
 * across the two channels.
 *
 * @param {Uint8Array[]} chunks
 * @returns {string}
 */
const decodeUtf8 = chunks => {
  if (chunks.length === 0) return '';
  let total = 0;
  for (const c of chunks) total += c.byteLength;
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder('utf-8').decode(merged);
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
 * @property {string}    [searchPath]      - $PATH override
 * @property {boolean}   [shell]           - whether to execute thru a shell
 * @property {SandboxSlice} [slice]
 *   - Optional persistent workspace `SandboxHandle` minted by
 *     `main.js` (`TODO/34_endo_genie_sandbox_main_wiring.md`).
 *     When supplied, every spawn is routed through
 *     `E(slice).spawn([exe, ...spawnArgs], { cwd, env })` instead of
 *     the host `child_process.spawn`.  The result-shape contract is
 *     preserved.  When absent, the tool falls back to host-side
 *     spawn — matching the pre-3.5a behaviour for callers
 *     (`dev-repl.js`, `self-boot.test.js`, the registry's
 *     no-include-list deployments) that do not have a slice.
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
  slice,
}) => {
  /**
   * @param {string} prog
   */
  const whichProgram = async prog => {
    await Promise.resolve();
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

      // Resolve the executable.  With a `host-bind` rootfs (the only
      // shape 3.5a wires up; see TADA/22 Decision 3) the host PATH is
      // mounted into the slice, so a host-resolved absolute path is
      // valid inside the slice too.  Other rootfs shapes (oci, custom
      // mount) will need a slice-aware lookup; that is out of scope
      // for sub-task 35.
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

      if (slice !== undefined) {
        // ── Slice spawn channel (TODO/35) ────────────────────────────
        // Route through the workspace `SandboxHandle` so the process
        // runs inside the slice's namespace + network profile rather
        // than on the bare host.  `child_process.spawn`'s `shell: true`
        // shortcut is unavailable on the slice surface, so we
        // explicitly wrap shell tools in `/bin/sh -c <cmdline>` here —
        // mirroring Node's own `shell: true` semantics (`/bin/sh -c`
        // with the resolved exe + args joined by spaces).
        /** @type {string[]} */
        const argv = shell
          ? ['/bin/sh', '-c', [exe, ...spawnArgs].join(' ')]
          : [exe, ...spawnArgs];

        // Per-spawn env: only PATH is propagated so the slice's view
        // of the host userland stays close to the operator's.  The
        // slice's construction-time env (set via `SandboxMakeOpts.env`)
        // remains the source of truth for everything else; this
        // override layers on top.
        /** @type {Record<string, string>} */
        const env = harden({
          PATH: searchPath || process.env.PATH || '/usr/bin:/bin',
        });

        /** @type {Record<string, unknown>} */
        const spawnOpts = { env };
        if (allowPath) spawnOpts.cwd = cwd;
        harden(spawnOpts);

        const proc = await E(slice).spawn(harden(argv), spawnOpts);

        const stdoutRef = await E(proc).stdout();
        const stderrRef = await E(proc).stderr();

        /** @type {Uint8Array[]} */
        const stdoutChunks = [];
        /** @type {Uint8Array[]} */
        const stderrChunks = [];

        const stdoutP = drainReaderRef(stdoutRef, stdoutChunks);
        const stderrP = drainReaderRef(stderrRef, stderrChunks);

        // Schedule the timeout so a hung child process eventually
        // returns control.  On fire we kill (best-effort) and reject;
        // a clean `wait()` resolution races us and clears the timer.
        /** @type {ReturnType<typeof setTimeout> | undefined} */
        let timer;
        const timeoutP = new Promise((_resolve, reject) => {
          timer = setTimeout(() => {
            void E(proc)
              .kill('SIGTERM')
              .catch(() => {});
            reject(new Error(`${name} timed out after ${timeoutMs}ms`));
          }, timeoutMs);
        });

        /** @type {{ code: number | null, signal: string | null }} */
        let exit;
        try {
          exit = /** @type {{ code: number | null, signal: string | null }} */ (
            await Promise.race([E(proc).wait(), timeoutP])
          );
        } finally {
          if (timer !== undefined) clearTimeout(timer);
        }

        // Drain any trailing bytes the streams produced after exit.
        // Stream errors during teardown are non-fatal — the process
        // already returned a status — so we swallow them.
        await Promise.all([
          stdoutP.catch(() => {}),
          stderrP.catch(() => {}),
        ]);

        const stdout = decodeUtf8(stdoutChunks);
        const stderr = decodeUtf8(stderrChunks);

        const exitCode = exit.code ?? -1;
        if (exitCode !== 0) {
          const err = new Error(
            `Command failed with exit code ${exitCode}`,
          );
          // @ts-expect-error — attach extra fields for callers
          err.code = exitCode;
          throw err;
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
        return out;
      }

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
// Pre-built tools (host-spawn; slice-aware variants live in registry.js)
// ---------------------------------------------------------------------------

/**
 * General-purpose system command tool with dangerous-pattern blocking.
 *
 * Slice-less variant — host-side `child_process.spawn`.  The
 * registry constructs the slice-aware sibling inside `buildGenieTools`
 * so it can pass the workspace `SandboxHandle` minted by `main.js`
 * (`TODO/34_endo_genie_sandbox_main_wiring.md`); see
 * `tools/registry.js` for that wiring.
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
 *
 * Slice-less variant — host-side `child_process.spawn`.  The
 * registry constructs the slice-aware sibling inside `buildGenieTools`
 * so it can pass the workspace `SandboxHandle` minted by `main.js`
 * (`TODO/34_endo_genie_sandbox_main_wiring.md`); see
 * `tools/registry.js` for that wiring.
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
  DANGEROUS_PATTERNS,
  makeCommandTool,
  bash,
  exec,
  rejectPatterns,
  rejectFlags,
  enforcePath,
};
