// @ts-check
/* global process, setTimeout, clearTimeout, Buffer */

/**
 * Integration test: dev-repl `bash` runs inside the slice.
 *
 * Drives `packages/genie/dev-repl.js` in `-c` (one-shot) mode with a
 * **scripted faux LLM** (see `_helpers/faux.js`) and verifies that
 * the agent's `bash` tool actually executes inside a confined sandbox
 * slice when one is available.
 *
 * The faux provider replaces the old `ollama/llama3.2` round-trip.
 * The previous shape relied on a live model that the test could only
 * hope would (a) be reachable on `localhost:11434`, (b) invoke the
 * bash tool, (c) not mis-quote the argv, and (d) actually shell-expand
 * the probe.  Each of those produced its own `SKIP:` rail, and the
 * TODO/57 audit found a real wiring regression hiding behind one of
 * them: the test exited 0 because the LLM probe flaked.
 *
 * The faux script:
 *   1. Emits a single `bash` tool call running `pwd && uname -a && ls -a /workspace`.
 *   2. After the tool result lands, emits a final assistant text that
 *      summarises the captured stdout (`MARKER cwd=… uname=… ls=…`).
 *
 * The test then asserts:
 *   - The wiring banner (`Sandbox: bwrap …` / `Sandbox: off`) shows
 *     the expected backend.
 *   - The dev-repl rendered a `⚡ bash` tool call (proves the agent
 *     reached the tool seam).
 *   - The captured stdout's `cwd` matches the expected value for the
 *     mode (`/workspace` for the slice path, the host workspace for
 *     `--sandbox off`).
 *   - The captured stdout's `uname` starts with `Linux` (sanity check
 *     on the slice's view of the host kernel).
 *   - The captured stdout's `ls` listing includes the workspace seed
 *     marker so we know the bind mount is wired.
 *
 * Skip rules:
 *   * `bwrap --version` must succeed (Probe A).  This is the only
 *     remaining skip; without bubblewrap there is no slice to mint.
 *   * `cat /proc/sys/kernel/unprivileged_userns_clone` must be `1`
 *     on hosts that expose the sysctl (Probe B).  When the file is
 *     absent the smoke test is the source of truth.
 *
 * The `--sandbox off` test does NOT need bubblewrap and therefore
 * does not skip on macOS / non-Linux contributor laptops.  (The
 * earlier ollama-driven `--sandbox off` test skipped when the
 * model was unreachable — that whole class of skip is gone now.)
 *
 * Sub-task of `TODO/61_genie_faux_llm_integration_test.md`.
 */

import '@endo/init/debug.js';

import { spawn as nodeSpawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import test from 'ava';

import { writeFauxScriptModule } from './_helpers/faux.js';

const moduleDirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = resolve(moduleDirname, '..');
const DEV_REPL = resolve(PACKAGE_DIR, 'dev-repl.js');

// The faux script module lives in a tmpdir outside the genie package
// (so a teardown can `rm -rf` the entire tree without surprising the
// workspace cleanup).  Node's bare-specifier resolution would fail
// for `@mariozechner/pi-ai` from a path outside any node_modules
// hierarchy, so we resolve the package's entry point to an absolute
// `file://…` URL up front via `import.meta.resolve` (which respects
// the ESM `exports` field, unlike `require.resolve`) and embed the
// URL in the generated script.
const PI_AI_URL = import.meta.resolve('@mariozechner/pi-ai');

// ---------------------------------------------------------------------------
// Skip probes — only bwrap / userns, no LLM-reachability probes
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
 * scrubbed environment plus `PATH`, `HOME`, any `GENIE_*` overrides,
 * and the explicitly-supplied `extraEnv` entries (used to thread the
 * `GENIE_FAUX_SCRIPT` path through to the child).
 *
 * @param {object} options
 * @param {string[]} options.args - Extra CLI args after `dev-repl.js`.
 * @param {string} options.cwd - Working directory for the child.
 * @param {Record<string, string>} [options.extraEnv] - Additional env
 *   entries to set on the child.  Used for `GENIE_FAUX_SCRIPT`.
 * @param {number} [options.timeoutMs] - Soft kill timer.  Defaults to
 *   30 seconds — the faux provider is in-process so the round-trip
 *   is millisecond-scale; the timeout exists only to bound a wedge.
 * @returns {Promise<DevReplResult>}
 */
const runDevRepl = async ({ args, cwd, extraEnv = {}, timeoutMs = 30_000 }) => {
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
    } else if (key.startsWith('GENIE_') || key === 'NODE_OPTIONS') {
      env[key] = value;
    }
  }
  for (const [key, value] of Object.entries(extraEnv)) {
    env[key] = value;
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
    setTimeout(() => proc.kill('SIGKILL'), 5000).unref();
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
// Faux-script source
// ---------------------------------------------------------------------------
//
// The script module runs **inside the dev-repl child**.  Its
// responsibilities, in order:
//
//   1. Register a pi-ai faux provider so its `Model<…>` is the agent's
//      model for this run (no network, no provider keys).
//   2. Queue a single `bash` tool call with the probe argv as the first
//      assistant turn.
//   3. Queue a factory step that runs after the tool result lands.  The
//      factory walks `context.messages`, finds the most recent
//      `toolResult` for `bash`, extracts the JSON-encoded stdout, and
//      emits a final assistant text containing a stable marker plus
//      the captured stdout — verbatim, on a single line, so the parent
//      test can grep for it.
//
// The script's default export is an `install()` function returning the
// `Model<…>` to use.  `dev-repl.js` threads that straight into
// `makePiAgent` via the `model:` option, bypassing the
// `provider/modelId` string parser.
//
// The script is written to a tmpdir per test so the marker (and faux
// `api` name) are unique — important when AVA decides to load this
// file concurrently with another faux-driven test, or when stale
// scrollback could otherwise satisfy the assertion.

/**
 * @param {object} options
 * @param {string} options.marker - Per-run sentinel string injected
 *   into the assistant's final reply so the parent test can grep for
 *   the right tool-result line.
 * @param {string} options.apiName - Faux `api` name (used as part of
 *   the model id banner the test does not inspect, but unique here
 *   keeps the registry collision-free).
 * @returns {string} The ESM module source.
 */
const buildFauxScript = ({ marker, apiName }) => `
import {
  registerFauxProvider,
  fauxAssistantMessage,
  fauxToolCall,
} from ${JSON.stringify(PI_AI_URL)};

const MARKER = ${JSON.stringify(marker)};
const API = ${JSON.stringify(apiName)};
const MODEL_ID = 'script-1';

export default function install() {
  const reg = registerFauxProvider({
    api: API,
    provider: 'faux',
    models: [{ id: MODEL_ID }],
  });

  reg.setResponses([
    // Turn 1: bash tool call.  The probe runs three commands joined
    // by '&&' so a single tool round-trip captures cwd, kernel, and
    // the workspace contents.  We use 'ls -a .' instead of an absolute
    // path so the same script works for both the slice (cwd =
    // /workspace) and the off path (cwd = host workspace dir).  '-a'
    // surfaces the seed marker ('.genie-workspace-init') in the
    // listing so the parent test can confirm the workspace is wired.
    //
    // The bash tool's schema is { args: string[] }; with shell: true
    // the argv is joined with spaces and run as a single shell command
    // (see spawner.js's useShell arm), so a one-element array carrying
    // the full pipeline is the canonical shape.
    fauxAssistantMessage(
      [
        fauxToolCall('bash', {
          args: ['pwd && uname -a && ls -a .'],
        }),
      ],
      { stopReason: 'toolUse' },
    ),

    // Turn 2: factory.  Read the bash result off context.messages
    // and emit a single-line summary the parent test can grep for.
    context => {
      const toolResult = [...context.messages]
        .reverse()
        .find(m => m.role === 'toolResult' && m.toolName === 'bash');
      let payload = 'no-bash-result';
      if (toolResult) {
        // The bash tool's JSON return value is wrapped in a TextContent
        // block ({ type: 'text', text: '<json>' }).  The genie agent's
        // toAgentTool serializes the tool result via JSON.stringify on
        // anything non-string, so the text is a JSON object with at
        // minimum a 'stdout' field.
        const textBlock = toolResult.content.find(b => b.type === 'text');
        if (textBlock) {
          try {
            const parsed = JSON.parse(textBlock.text);
            payload = parsed.stdout
              ? parsed.stdout.replace(/\\n/g, '|')
              : JSON.stringify(parsed);
          } catch {
            payload = textBlock.text.replace(/\\n/g, '|');
          }
        }
      }
      return fauxAssistantMessage(
        \`\${MARKER} \${payload} \${MARKER}-END\`,
        { stopReason: 'stop' },
      );
    },
  ]);

  return reg.models[0];
}
`;

// ---------------------------------------------------------------------------
// Probe shape — extract the marker line from the dev-repl stdout
// ---------------------------------------------------------------------------
//
// The dev-repl prints the final assistant text after a `genie>` prefix.
// We anchor on the per-run marker so a stale scrollback line or a
// background-printer event cannot satisfy the regex by accident.

/**
 * Extract the single line of summary text the faux factory emitted.
 * Returns the captured payload (without the marker bookends) or
 * `undefined` when the marker is absent.
 *
 * @param {string} stdout
 * @param {string} marker
 * @returns {string | undefined}
 */
const extractSummary = (stdout, marker) => {
  // Strip ANSI escapes so the payload survives the dev-repl's
  // genie> prefix highlighting.  The regex is non-greedy so a long
  // summary with internal whitespace is captured correctly.
  // eslint-disable-next-line no-control-regex
  const clean = stdout.replace(/\[[0-9;]*m/g, '');
  const re = new RegExp(`${marker} ([\\s\\S]*?) ${marker}-END`);
  const m = re.exec(clean);
  return m ? m[1] : undefined;
};

/**
 * The dev-repl renders a tool invocation as `⚡ bash …` (with ANSI
 * colour codes between the tokens).  The literal therefore proves the
 * model actually invoked the bash tool, which is now table-stakes
 * because the faux script is the only thing in the loop.
 *
 * @param {string} stdout
 * @returns {boolean}
 */
const stdoutShowsBashCall = stdout => stdout.includes('⚡ bash');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.serial('dev-repl --sandbox bwrap runs bash inside the slice', async t => {
  t.timeout(60_000);

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

  // ── Workspace + script tmpdir + teardown ─────────────────────────
  const workspaceDir = await fs.mkdtemp(
    join(tmpdir(), 'genie-dev-repl-sandbox-'),
  );
  t.teardown(() => fs.rm(workspaceDir, { recursive: true, force: true }));

  const scriptDir = await fs.mkdtemp(join(tmpdir(), 'genie-faux-script-'));
  t.teardown(() => fs.rm(scriptDir, { recursive: true, force: true }));

  const marker = `SLICE_PROBE_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const apiName = `faux-slice-${Date.now().toString(36)}`;
  const scriptPath = await writeFauxScriptModule({
    dir: scriptDir,
    source: buildFauxScript({ marker, apiName }),
  });

  // ── Drive the dev-repl ───────────────────────────────────────────
  const result = await runDevRepl({
    args: [
      '-w',
      workspaceDir,
      '-v',
      '--sandbox',
      'bwrap',
      '--network',
      'none',
      '-c',
      // The probe text is irrelevant to the faux LLM — only the bash
      // tool result matters — but we feed something meaningful so the
      // dev-repl's echo lines are informative when the test fails.
      'Probe the slice cwd, kernel, and /workspace listing.',
    ],
    cwd: workspaceDir,
    extraEnv: { GENIE_FAUX_SCRIPT: scriptPath },
  });

  // ── Assertions ───────────────────────────────────────────────────
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

  if (!/Sandbox:\s*bwrap/.test(result.stdout)) {
    dump();
    t.fail(
      'banner should report `Sandbox: bwrap (...)` when the slice was minted',
    );
    return;
  }

  if (!stdoutShowsBashCall(result.stdout)) {
    dump();
    t.fail(
      'expected `⚡ bash` in dev-repl stdout — the faux script always emits a bash tool call on the first turn; absence means the agent never reached the tool seam',
    );
    return;
  }

  const summary = extractSummary(result.stdout, marker);
  if (summary === undefined) {
    dump();
    t.fail(
      `expected marker ${marker} … ${marker}-END in dev-repl stdout — the faux factory always emits this line; absence means the second-turn handoff regressed`,
    );
    return;
  }

  // The faux factory replaces newlines with '|' so the entire summary
  // lands on a single line.  The probe ran `pwd && uname -a && ls -a
  // /workspace`, so the captured stdout should contain:
  //   /workspace|Linux …|.|..|.genie-workspace-init|…
  // We assert each piece independently so a partial regression names
  // which capture failed rather than dumping the whole payload.
  t.true(
    summary.startsWith('/workspace|'),
    `expected summary to start with '/workspace|' (slice cwd); got: ${summary}`,
  );
  t.true(
    /\|Linux\s/.test(summary),
    `expected summary to contain a 'Linux <kernel>' uname line; got: ${summary}`,
  );
  t.true(
    summary.includes('.genie-workspace-init'),
    `expected ls -a /workspace to list the workspace seed marker .genie-workspace-init; got: ${summary}`,
  );
});

test.serial('dev-repl --sandbox off runs bash on the host', async t => {
  t.timeout(60_000);

  // No skip rails — the off path does not need bwrap and the faux
  // provider does not need a network.  This test now passes on macOS
  // and on kernels without unprivileged user namespaces, restoring
  // the cross-platform contract the original SKIP-rich test only
  // gestured at.

  const workspaceDir = await fs.mkdtemp(join(tmpdir(), 'genie-dev-repl-host-'));
  t.teardown(() => fs.rm(workspaceDir, { recursive: true, force: true }));

  const scriptDir = await fs.mkdtemp(join(tmpdir(), 'genie-faux-script-host-'));
  t.teardown(() => fs.rm(scriptDir, { recursive: true, force: true }));

  const marker = `HOST_PROBE_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const apiName = `faux-host-${Date.now().toString(36)}`;
  const scriptPath = await writeFauxScriptModule({
    dir: scriptDir,
    source: buildFauxScript({ marker, apiName }),
  });

  const result = await runDevRepl({
    args: [
      '-w',
      workspaceDir,
      '-v',
      '--sandbox',
      'off',
      '-c',
      'Probe the host cwd, kernel, and workspace listing.',
    ],
    cwd: workspaceDir,
    extraEnv: { GENIE_FAUX_SCRIPT: scriptPath },
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

  if (!/Sandbox:\s*off/.test(result.stdout)) {
    dump();
    t.fail('banner should report `Sandbox: off` when --sandbox off is set');
    return;
  }

  if (!stdoutShowsBashCall(result.stdout)) {
    dump();
    t.fail(
      'expected `⚡ bash` in dev-repl stdout — the faux script always emits a bash tool call',
    );
    return;
  }

  const summary = extractSummary(result.stdout, marker);
  if (summary === undefined) {
    dump();
    t.fail(`expected marker ${marker} in dev-repl stdout`);
    return;
  }

  // The host-mode probe was `pwd && uname -a && ls -a .`.  Cwd is the
  // host workspace dir (which the bash tool inherits from the host
  // spawner).  Real-path resolution: `mkdtemp` may yield a path with
  // symlinks (e.g. `/tmp` -> `/private/tmp` on macOS); the shell
  // prints the resolved form, so we compare against both.
  const resolvedWorkspace = await fs.realpath(workspaceDir);
  const cwdStart = `${workspaceDir}|`;
  const cwdStartResolved = `${resolvedWorkspace}|`;
  t.true(
    summary.startsWith(cwdStart) || summary.startsWith(cwdStartResolved),
    `expected summary to start with the host workspace path; got: ${summary}`,
  );
  // host bash on Linux reports Linux; on macOS uname is Darwin.  We
  // accept either so the off-path test exercises cross-platform.
  t.true(
    /\|(Linux|Darwin)\s/.test(summary),
    `expected summary to contain a uname line; got: ${summary}`,
  );
  // The workspace seed marker proves the workspace was initialised
  // (the same `initWorkspaceMount` path the slice test exercises).
  t.true(
    summary.includes('.genie-workspace-init'),
    `expected ls -a . to list the workspace seed marker .genie-workspace-init; got: ${summary}`,
  );
});
