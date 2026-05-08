// @ts-check
/* global process, setTimeout, clearTimeout, fetch, AbortSignal, Buffer */

/**
 * Integration test: dev-repl `bash` runs inside the slice.
 *
 * Drives `packages/genie/dev-repl.js` in `-c` (one-shot) mode and
 * verifies that the agent's `bash` tool actually executes inside a
 * confined sandbox slice when one is available.  Skips cleanly on
 * platforms where no backend is present (macOS, kernels lacking
 * unprivileged user namespaces, hosts without `bwrap`) and when no
 * local LLM is reachable.
 *
 * Mirrors `yarn test:integration:sandbox-slice` for the daemon path
 * (see `packages/genie/CLAUDE.md` § "Integration path") so the same
 * probes confirm both rollouts.
 *
 * Sub-task of `TODO/55_genie_dev_repl_sandbox_test.md`.
 *
 * Skip rules:
 *   * `bwrap --version` must succeed (Probe A).
 *   * `cat /proc/sys/kernel/unprivileged_userns_clone` must be `1` on
 *     hosts that expose the sysctl (Probe B).  When the file is
 *     absent the smoke test is the source of truth.
 *   * The configured `GENIE_MODEL` (default `ollama/llama3.2`) must be
 *     reachable.  We probe `http://localhost:11434/api/tags` for
 *     ollama-shaped specs; non-ollama specs are accepted on faith
 *     because their reachability check would require provider keys
 *     this test does not own.
 *
 * The `--sandbox off` test only requires the LLM probe — it covers
 * the host-spawn fall-through path that lets the dev-repl run on
 * macOS / non-Linux contributor laptops.
 *
 * SKIP rails on the LLM side
 * --------------------------
 *
 * Each test discriminates between three classes of "the LLM didn't
 * cooperate" — all three become `t.log('SKIP: …'); t.pass()` rather
 * than `t.fail()`, because they tell us nothing about the slice
 * wiring:
 *
 *   1. Model never invoked the bash tool — surfaced when the
 *      `⚡ bash` ToolCallStart literal is absent from stdout.  With
 *      `ollama/llama3.2` (the default), the most common shape is the
 *      model emitting a JSON-shaped tool call inside its assistant
 *      message instead of routing through the pi-ai tool channel.
 *   2. Model invoked bash but the marker never landed in stdout —
 *      typically a malformed argv that broke the `$(pwd)` shell
 *      expansion (e.g. arguments split across multiple array
 *      entries).
 *   3. Model invoked bash but the shell did not expand `$(pwd)` —
 *      the marker landed as `marker=$(pwd)` (literal) instead of
 *      `marker=/workspace`.  This is an LLM escaping flake.
 *
 * The wiring assertions (`Sandbox: bwrap` banner, exit 0) run
 * unconditionally even when the LLM probe skips, so every test run
 * still exercises the slice mint and process lifecycle.  A genuine
 * wiring regression (slice mint failure, missing banner, process
 * crash) fails the test loudly regardless of the LLM's behaviour.
 */

import '@endo/init/debug.js';

import { spawn as nodeSpawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import test from 'ava';

const moduleDirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = resolve(moduleDirname, '..');
const DEV_REPL = resolve(PACKAGE_DIR, 'dev-repl.js');

const GENIE_MODEL = process.env.GENIE_MODEL ?? 'ollama/llama3.2';

// ---------------------------------------------------------------------------
// Skip probes
// ---------------------------------------------------------------------------

/**
 * Spawn `bwrap --version` and resolve to a structured availability
 * report.  Mirrors the `probeBwrap` helper in
 * `packages/sandbox/test/bwrap.test.js`.
 *
 * @returns {Promise<{ available: boolean; reason?: string }>}
 */
const probeBwrap = async () => {
  await null;
  try {
    /** @type {import('node:child_process').ChildProcess} */
    const proc = nodeSpawn('bwrap', ['--version'], { stdio: 'ignore' });
    return await new Promise(resolveProbe => {
      proc.once('error', err =>
        resolveProbe({
          available: false,
          reason: /** @type {Error} */ (err).message,
        }),
      );
      proc.once('close', code => {
        if (code === 0) {
          resolveProbe({ available: true });
        } else {
          resolveProbe({
            available: false,
            reason: `bwrap --version exit ${code}`,
          });
        }
      });
    });
  } catch (e) {
    return { available: false, reason: /** @type {Error} */ (e).message };
  }
};

/**
 * Confirm the kernel permits unprivileged user-namespace creation.
 * Reads the Debian-derived sysctl when present (other distros omit
 * the file because the feature is unconditionally enabled).
 *
 * @returns {Promise<{ available: boolean; reason?: string }>}
 */
const probeUserns = async () => {
  await null;
  try {
    const value = (
      await fs.readFile('/proc/sys/kernel/unprivileged_userns_clone', 'utf8')
    ).trim();
    if (value === '0') {
      return {
        available: false,
        reason: 'sysctl kernel.unprivileged_userns_clone=0',
      };
    }
    return { available: true };
  } catch (err) {
    const error = /** @type {NodeJS.ErrnoException} */ (err);
    if (error.code === 'ENOENT') {
      // Sysctl absent — feature is on by default; defer to bwrap probe.
      return { available: true };
    }
    return { available: false, reason: error.message };
  }
};

/**
 * Probe that the configured LLM provider is reachable.  Only the
 * `ollama/*` family is checked actively — every other provider is
 * accepted on faith because reaching their public endpoints would
 * require API keys this test does not own (and would be slow even
 * with them).
 *
 * @returns {Promise<{ available: boolean; reason?: string }>}
 */
const probeModel = async () => {
  await null;
  if (!GENIE_MODEL.startsWith('ollama/')) {
    // Not ollama — assume the operator-supplied provider is reachable.
    return { available: true };
  }
  const modelId = GENIE_MODEL.slice('ollama/'.length);
  try {
    const response = await fetch('http://localhost:11434/api/tags', {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      return {
        available: false,
        reason: `ollama /api/tags HTTP ${response.status}`,
      };
    }
    const body = /** @type {{ models?: Array<{ name?: string }> }} */ (
      await response.json()
    );
    const names = (body.models ?? [])
      .map(m => m.name ?? '')
      .filter(n => n !== '');
    // Accept either an exact match or a `<modelId>:<tag>` variant so
    // operators don't need to spell out `:latest`.
    const match = names.some(n => n === modelId || n.startsWith(`${modelId}:`));
    if (!match) {
      return {
        available: false,
        reason: `ollama model ${modelId} not present (have: ${names.join(', ') || '<none>'})`,
      };
    }
    return { available: true };
  } catch (err) {
    return {
      available: false,
      reason: /** @type {Error} */ (err).message,
    };
  }
};

// ---------------------------------------------------------------------------
// Dev-REPL spawn helper
// ---------------------------------------------------------------------------

/**
 * @typedef {object} DevReplResult
 * @property {number | null} code
 * @property {string | null} signal
 * @property {string} stdout
 * @property {string} stderr
 */

/**
 * Run `node packages/genie/dev-repl.js …` as a child process and
 * collect the captured streams.  The spawned process inherits a
 * scrubbed environment plus `PATH`, `HOME`, the operator-supplied
 * `*_API_KEY`s, and any `GENIE_*` overrides — enough for ollama and
 * the major hosted providers without leaking the test runner's
 * unrelated state into the child.
 *
 * @param {object} options
 * @param {string[]} options.args - Extra CLI args after `dev-repl.js`.
 * @param {string} options.cwd - Working directory for the child.
 * @param {number} [options.timeoutMs] - Soft kill timer.  Defaults to
 *   90 seconds, which is a comfortable upper bound for ollama/llama3.2
 *   on a warm CPU.
 * @returns {Promise<DevReplResult>}
 */
const runDevRepl = async ({ args, cwd, timeoutMs = 90_000 }) => {
  await null;
  /** @type {Record<string, string>} */
  const env = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
  };
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) {
      // No-op: an unset env var has nothing to forward.  Inverted from
      // the conventional `continue` to keep `no-continue` happy.
    } else if (
      key.startsWith('GENIE_') ||
      key.endsWith('_API_KEY') ||
      key === 'OLLAMA_HOST' ||
      key === 'NODE_OPTIONS'
    ) {
      env[key] = value;
    }
  }

  const proc = nodeSpawn(process.execPath, [DEV_REPL, ...args], {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  /** @type {Buffer[]} */
  const stdoutChunks = [];
  /** @type {Buffer[]} */
  const stderrChunks = [];
  proc.stdout?.on('data', chunk => stdoutChunks.push(chunk));
  proc.stderr?.on('data', chunk => stderrChunks.push(chunk));

  let killed = false;
  const timer = setTimeout(() => {
    killed = true;
    proc.kill('SIGTERM');
    // Hard kill after a 5s grace if SIGTERM is ignored.
    setTimeout(() => proc.kill('SIGKILL'), 5_000).unref();
  }, timeoutMs);

  /** @type {{ code: number | null; signal: NodeJS.Signals | null }} */
  const exit = await new Promise((resolveExit, rejectExit) => {
    proc.once('error', err => {
      clearTimeout(timer);
      rejectExit(err);
    });
    proc.once('close', (code, signal) => {
      clearTimeout(timer);
      resolveExit({ code, signal });
    });
  });

  const stdout = Buffer.concat(stdoutChunks).toString('utf8');
  const stderr = Buffer.concat(stderrChunks).toString('utf8');

  if (killed) {
    throw new Error(
      `dev-repl exceeded ${timeoutMs}ms timeout.\nstdout=${stdout}\nstderr=${stderr}`,
    );
  }

  return { code: exit.code, signal: exit.signal, stdout, stderr };
};

// ---------------------------------------------------------------------------
// Probe shape
// ---------------------------------------------------------------------------
//
// The probe asks the model to run a single bash one-liner that wraps
// `pwd` inside a recognisable assignment so the test can match a
// stable substring against the model's reply OR — more robustly —
// against the verbose-mode tool result the dev-repl prints when `-v`
// is passed.  We ask the model to "report verbatim" but the
// verbose-mode tool result is the source of truth: the bash tool's
// JSON return value contains the raw stdout, so the assertion does
// not depend on the model faithfully echoing it.
//
// The marker is salted per-run so a stale terminal scrollback or a
// previous failed run cannot satisfy the assertion accidentally.
//
// The wording mirrors `test/scenarios/sandbox-slice.sh`'s daemon-side
// probes ("Please run the bash command `…` and reply with the exact
// output…") for two reasons: (1) the daemon-side scenario already
// proves this wording is reliable enough with ollama/llama3.2, and
// (2) sharing the wording keeps the two integration paths comparable.

/**
 * @param {string} marker
 * @returns {string}
 */
const buildProbe = marker =>
  [
    `Please use the bash tool to run the command:`,
    ``,
    `    echo "${marker}=$(pwd)"`,
    ``,
    `Then reply with the exact stdout from the tool, with no commentary.`,
  ].join('\n');

/**
 * The dev-repl renders a tool invocation as `⚡ bash …` (with ANSI
 * colour codes interleaved between the literal tokens — see
 * `runAgentEvents`'s `ToolCallStart` arm in `dev-repl.js`).  The
 * `⚡ bash` literal therefore proves the model actually invoked the
 * bash tool, distinct from "the model hallucinated an answer that
 * happened to look right".  A test run that gets a 0 exit code but
 * no `⚡ bash` token is an LLM-following-instructions failure, not a
 * slice-wiring regression — surfacing it as a SKIP keeps the test
 * signal focused on what it is actually exercising.
 *
 * The lightning-bolt prefix is unambiguous: the only other occurrence
 * of the literal `bash` in dev-repl stdout is the `Tools: bash, exec,
 * …` banner line, which never starts with `⚡`.
 *
 * @param {string} stdout
 * @returns {boolean}
 */
const stdoutShowsBashCall = stdout => stdout.includes('⚡ bash');

/**
 * Extract the value the bash tool reported for `pwd` by scanning for
 * the sentinel marker `<marker>=<value>`.  The marker only appears
 * after `$(pwd)` has actually been expanded by a shell — the model
 * has no way to fabricate a real host path that matches both the
 * salted marker AND the workspace directory without invoking bash
 * (the system prompt names the host workspace path but never
 * `/workspace`).
 *
 * Returns `undefined` when the marker prefix is absent (i.e. the
 * model called bash with malformed args, or never called it at
 * all).  The caller treats that as an LLM flake.
 *
 * @param {string} stdout
 * @param {string} marker
 * @returns {string | undefined}
 */
const extractMarkerValue = (stdout, marker) => {
  // Match `<marker>=` followed by a non-whitespace, non-quote run.
  // The captured value may show up either inside the verbose tool
  // result preview (`✓ done {... "stdout":"<marker>=/workspace\n"}`)
  // or in the assistant's final reply (`genie> <marker>=/workspace`).
  // Both shapes terminate the value at whitespace, ANSI escape, or
  // the JSON terminator — capturing greedy-non-whitespace handles
  // both without baking in an ANSI-stripping pass.
  const re = new RegExp(`${marker}=([^\\s"\\\\\\u001b]+)`);
  const m = re.exec(stdout);
  return m ? m[1] : undefined;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.serial('dev-repl --sandbox bwrap runs bash inside the slice', async t => {
  t.timeout(120_000);

  // ── Skip rails ───────────────────────────────────────────────────
  const bwrap = await probeBwrap();
  if (!bwrap.available) {
    t.log(`SKIP: bwrap unavailable: ${bwrap.reason}`);
    t.pass();
    return;
  }
  const userns = await probeUserns();
  if (!userns.available) {
    t.log(`SKIP: unprivileged user namespaces unavailable: ${userns.reason}`);
    t.pass();
    return;
  }
  const model = await probeModel();
  if (!model.available) {
    t.log(`SKIP: model ${GENIE_MODEL} unreachable: ${model.reason}`);
    t.pass();
    return;
  }

  // ── Workspace tmpdir + teardown ──────────────────────────────────
  const workspaceDir = await fs.mkdtemp(
    join(tmpdir(), 'genie-dev-repl-sandbox-'),
  );
  t.teardown(() => fs.rm(workspaceDir, { recursive: true, force: true }));

  // ── Drive the dev-repl ───────────────────────────────────────────
  const marker = `SLICE_PWD_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const probe = buildProbe(marker);

  const result = await runDevRepl({
    args: [
      '-w',
      workspaceDir,
      '-m',
      GENIE_MODEL,
      '-v',
      '--sandbox',
      'bwrap',
      '--network',
      'none',
      '-c',
      probe,
    ],
    cwd: workspaceDir,
  });

  // ── Assertions ───────────────────────────────────────────────────
  // Always log the captured streams when an assertion is going to
  // fail so the operator can attribute a regression to either the
  // dev-repl wiring (e.g. slice mint failure on stderr) or an LLM
  // hiccup (e.g. wrong tool selection in stdout).
  const dump = () => {
    t.log(`stdout (${result.stdout.length} bytes):\n${result.stdout}`);
    t.log(`stderr (${result.stderr.length} bytes):\n${result.stderr}`);
  };

  if (result.code !== 0) {
    dump();
    t.fail(
      `dev-repl exited non-zero (code=${result.code}, signal=${result.signal ?? 'none'})`,
    );
    return;
  }

  // The dev-repl announces the slice mint via its dim banner; pin
  // the resolved backend so a regression that silently fell back to
  // the host spawner would fail this assertion even if the model
  // happened to reply `/workspace` for unrelated reasons.  Asserted
  // first because the banner is deterministic (no LLM in the loop
  // for the slice mint) — a banner regression is always a real
  // failure, never an LLM flake.
  if (!/Sandbox:\s*bwrap/.test(result.stdout)) {
    dump();
    t.fail(
      'banner should report `Sandbox: bwrap (...)` when the slice was minted',
    );
    return;
  }

  // If the model never invoked the bash tool, treat it as an LLM
  // flake and skip rather than fail — we cannot assert on the
  // slice's `pwd` output if `bash` was never called.  The
  // `⚡ bash` literal comes from the `ToolCallStart` arm in
  // `dev-repl.js`'s `runAgentEvents`.
  if (!stdoutShowsBashCall(result.stdout)) {
    dump();
    t.log(
      'SKIP: model did not invoke the bash tool — LLM following-instructions failure, not a slice-wiring regression',
    );
    t.pass();
    return;
  }

  // The slice's cwd is `/workspace` (set by `mintGenieSlice` via
  // `SLICE_WORKSPACE_PATH`); a `pwd` invocation inside the slice
  // therefore prints exactly that.  When the model called bash
  // with malformed args (the most common llama3.2 failure mode is
  // splitting `echo "X=$(pwd)"` into separate argv entries that
  // break the shell expansion), the marker never lands in stdout;
  // we surface that as a SKIP because it is an LLM flake, not a
  // wiring regression.  When the marker DOES land but with the
  // wrong value, the slice cwd has genuinely regressed and we
  // fail loudly.
  const value = extractMarkerValue(result.stdout, marker);
  if (value === undefined) {
    dump();
    t.log(
      'SKIP: model invoked bash but the marker did not appear in stdout — likely a malformed argv that broke the shell expansion',
    );
    t.pass();
    return;
  }
  // The literal `$(pwd)` (or `\$(pwd)`) means the model passed the
  // probe text through without letting the shell expand it — a
  // common llama3.2 escaping flake.  Treat it as a SKIP because the
  // bash tool ran but the test cannot conclude anything about the
  // slice cwd from an unexpanded literal.
  if (value === '$(pwd)' || value === '\\$(pwd)') {
    dump();
    t.log(
      `SKIP: model passed the probe through bash without shell-expanding $(pwd) — got ${marker}=${value}; LLM escaping flake, not a slice-wiring regression`,
    );
    t.pass();
    return;
  }
  if (value !== '/workspace') {
    dump();
    t.fail(
      `expected ${marker}=/workspace in dev-repl stdout, got ${marker}=${value} (slice cwd regressed away from /workspace)`,
    );
    return;
  }

  t.pass();
});

test.serial('dev-repl --sandbox off runs bash on the host', async t => {
  t.timeout(120_000);

  // No bwrap dependency for the off path — only the model.
  const model = await probeModel();
  if (!model.available) {
    t.log(`SKIP: model ${GENIE_MODEL} unreachable: ${model.reason}`);
    t.pass();
    return;
  }

  const workspaceDir = await fs.mkdtemp(join(tmpdir(), 'genie-dev-repl-host-'));
  t.teardown(() => fs.rm(workspaceDir, { recursive: true, force: true }));

  const marker = `HOST_PWD_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const probe = buildProbe(marker);

  const result = await runDevRepl({
    args: [
      '-w',
      workspaceDir,
      '-m',
      GENIE_MODEL,
      '-v',
      '--sandbox',
      'off',
      '-c',
      probe,
    ],
    cwd: workspaceDir,
  });

  const dump = () => {
    t.log(`stdout (${result.stdout.length} bytes):\n${result.stdout}`);
    t.log(`stderr (${result.stderr.length} bytes):\n${result.stderr}`);
  };

  if (result.code !== 0) {
    dump();
    t.fail(
      `dev-repl exited non-zero (code=${result.code}, signal=${result.signal ?? 'none'})`,
    );
    return;
  }

  // Banner sanity-check: the off path renders `Sandbox: off`.
  if (!/Sandbox:\s*off/.test(result.stdout)) {
    dump();
    t.fail('banner should report `Sandbox: off` when --sandbox off is set');
    return;
  }

  if (!stdoutShowsBashCall(result.stdout)) {
    dump();
    t.log(
      'SKIP: model did not invoke the bash tool — LLM following-instructions failure, not a host-spawner regression',
    );
    t.pass();
    return;
  }

  // The host spawner inherits the dev-repl's process cwd
  // (`workspaceDir`, since we passed it as `cwd` to the spawn).  A
  // `pwd` invocation therefore prints the operator's host path, NOT
  // the slice's `/workspace`.  Same SKIP-vs-FAIL discriminator as
  // the slice test: marker absent => LLM flake, marker present =>
  // assert on the value.
  //
  // Real-path resolution: `mkdtemp` returns the path with whatever
  // symlinks the OS exposes (e.g. `/tmp/genie-…` may shadow
  // `/private/tmp/genie-…` on macOS or `/var/tmp` symlinks on some
  // Linux distros).  `pwd` inside the shell prints the resolved
  // path.  Comparing the resolved form on both sides avoids a
  // false negative on hosts where `/tmp` is a symlink target.
  const value = extractMarkerValue(result.stdout, marker);
  if (value === undefined) {
    dump();
    t.log(
      'SKIP: model invoked bash but the marker did not appear in stdout — likely a malformed argv that broke the shell expansion',
    );
    t.pass();
    return;
  }
  if (value === '$(pwd)' || value === '\\$(pwd)') {
    dump();
    t.log(
      `SKIP: model passed the probe through bash without shell-expanding $(pwd) — got ${marker}=${value}; LLM escaping flake, not a host-spawner regression`,
    );
    t.pass();
    return;
  }
  if (value === '/workspace') {
    dump();
    t.fail(
      'host-mode pwd must not be /workspace (slice marker leaked into off path)',
    );
    return;
  }
  const resolvedWorkspace = await fs.realpath(workspaceDir);
  if (value !== workspaceDir && value !== resolvedWorkspace) {
    dump();
    t.fail(
      `expected ${marker}=${workspaceDir} (or its realpath ${resolvedWorkspace}) in dev-repl stdout, got ${marker}=${value} (host-spawner cwd regressed)`,
    );
    return;
  }

  t.pass();
});
