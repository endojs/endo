// @ts-check

/**
 * Regression tests for the `sliceWorkspacePath` plumbing
 * (`TODO/62_genie_system_prompt_slice_workspace_path.md`).
 *
 * Before this lift the system prompt advertised the **host** workspace
 * path as the model's working directory, and the `bash` / `exec` / `git`
 * tool descriptions said nothing about the slice's bind-mount.  Under
 * `--sandbox bwrap` (or the daemon's slice path) the host directory is
 * not visible inside the slice — only the slice-internal mount path
 * (`/workspace`) is — so the model regularly fed the host path into
 * `bash` and got `No such file or directory` back.
 *
 * The fix threads an optional `sliceWorkspacePath` through three layers:
 *   1. `buildSystemPrompt` adds a "Command-tool workspace path" line to
 *      the Runtime Info section.
 *   2. `makePiAgent` forwards the option into `buildSystemPrompt` so the
 *      built system prompt lands in `piAgent.state.systemPrompt`.
 *   3. `makeGenieAgents` forwards the option into every `makeAgent` call
 *      (main + heartbeat).
 *   4. `buildGenieTools` forwards the option into the `bash` / `exec` /
 *      `git` tool descriptions.
 *
 * These tests pin each layer:
 *   • `buildSystemPrompt` mentions the path exactly once when set, and
 *     not at all when unset.
 *   • `makePiAgent` with a faux model puts the line in `state.systemPrompt`.
 *   • `makeGenieAgents` threads the option down to the stub `makeAgent`.
 *   • `buildGenieTools` puts the slice path in the bash tool's `help()`.
 *
 * The faux-LLM path rides the same provider TODO/61 introduced for the
 * dev-repl-sandbox harness, but here it stays in-process: we register a
 * faux provider, grab the resulting `Model<…>` object, and pass it
 * straight into `makePiAgent` so the test never hits the network and
 * never spawns a subprocess.
 */

import '@endo/init/debug.js';

import test from 'ava';
import { registerFauxProvider } from '@earendil-works/pi-ai';

import buildSystemPrompt from '../../src/system/index.js';
import { makePiAgent } from '../../src/agent/index.js';
import { makeGenieAgents } from '../../src/loop/agents.js';
import { buildGenieTools } from '../../src/tools/registry.js';
import { SLICE_WORKSPACE_PATH } from '../../src/sandbox/slice.js';

// ---------------------------------------------------------------------------
// `buildSystemPrompt` — the lowest level
// ---------------------------------------------------------------------------

test('buildSystemPrompt — slice path absent when sliceWorkspacePath is unset', t => {
  const prompt = Array.from(
    buildSystemPrompt({
      hostname: 'test-host',
      currentTime: '2026-05-12T00:00:00Z',
      workspaceDir: '/home/user/project',
    }),
  ).join('\n');

  t.false(
    prompt.includes('Command-tool workspace path'),
    'must not advertise a slice path when none was supplied',
  );
  // The slice's canonical mount path must not leak in from anywhere
  // else when no slice was requested.
  t.false(
    prompt.includes('/workspace'),
    'the default slice mount path must not appear unsolicited',
  );
});

test('buildSystemPrompt — slice path appears exactly once when sliceWorkspacePath is set', t => {
  const prompt = Array.from(
    buildSystemPrompt({
      hostname: 'test-host',
      currentTime: '2026-05-12T00:00:00Z',
      workspaceDir: '/home/user/project',
      sliceWorkspacePath: '/workspace',
    }),
  ).join('\n');

  const headerMatches = prompt.match(/Command-tool workspace path/g) || [];
  t.is(headerMatches.length, 1, 'one and only one slice-path line');
  // Spot-check the surrounding context: the model needs to know that
  // bash / exec / git see this path, and that the host path above is
  // the same bytes.
  t.regex(prompt, /bash.*exec.*git/, 'lists the affected command tools');
  t.regex(prompt, /bind-mounted/, 'explains the bind-mount relationship');
  // The host path stays advertised; the slice path is additive.
  t.true(
    prompt.includes('/home/user/project'),
    'host workspace path stays in the runtime-info section',
  );
});

// ---------------------------------------------------------------------------
// `makePiAgent` — verifies the option lands in `piAgent.state.systemPrompt`
// ---------------------------------------------------------------------------

/**
 * Register a per-test faux provider so we have a real `Model<…>` object
 * to feed into `makePiAgent` without hitting the network.  The
 * registration is torn down in the test's teardown registry so a stale
 * registration cannot leak into a sibling test.
 *
 * @param {import('ava').ExecutionContext<unknown>} t
 * @param {string} apiName
 */
const registerForTest = (t, apiName) => {
  const reg = registerFauxProvider({
    api: apiName,
    provider: 'faux',
    models: [{ id: 'm1' }],
  });
  t.teardown(() => reg.unregister());
  return reg.getModel();
};

test('makePiAgent — slice path lands in piAgent.state.systemPrompt when set', async t => {
  const model = registerForTest(t, 'faux-slice-test-1');
  const piAgent = await makePiAgent({
    hostname: 'test-host',
    currentTime: '2026-05-12T00:00:00Z',
    workspaceDir: '/home/user/project',
    sliceWorkspacePath: SLICE_WORKSPACE_PATH,
    model,
  });

  const { systemPrompt } = piAgent.state;
  t.true(
    systemPrompt.includes(SLICE_WORKSPACE_PATH),
    `systemPrompt mentions ${SLICE_WORKSPACE_PATH}`,
  );
  t.true(
    systemPrompt.includes('Command-tool workspace path'),
    'systemPrompt has the slice-path runtime-info entry',
  );
  // One occurrence — same invariant as the buildSystemPrompt test.
  const matches = systemPrompt.match(/Command-tool workspace path/g) || [];
  t.is(matches.length, 1);
});

test('makePiAgent — slice path absent when option is unset', async t => {
  const model = registerForTest(t, 'faux-slice-test-2');
  const piAgent = await makePiAgent({
    hostname: 'test-host',
    currentTime: '2026-05-12T00:00:00Z',
    workspaceDir: '/home/user/project',
    model,
  });

  const { systemPrompt } = piAgent.state;
  t.false(
    systemPrompt.includes('Command-tool workspace path'),
    'no slice-path line when sliceWorkspacePath was unset',
  );
  t.false(
    systemPrompt.includes('/workspace'),
    'the default slice mount path must not leak in',
  );
});

// ---------------------------------------------------------------------------
// `makeGenieAgents` — verifies the option is threaded to every makeAgent call
// ---------------------------------------------------------------------------

const stubTools = () => {
  const listTools = () => [];
  const execTool = async () => {
    throw new Error('execTool not expected');
  };
  return /** @type {any} */ ({
    tools: {},
    listTools,
    execTool,
    memoryTools: undefined,
    searchBackend: undefined,
  });
};

test('makeGenieAgents — sliceWorkspacePath threads to every makeAgent call', async t => {
  /** @type {any[]} */
  const calls = [];
  const makeAgent = /** @type {any} */ (
    async (/** @type {any} */ opts) => {
      calls.push(opts);
      return { __stub: 'piAgent' };
    }
  );

  await makeGenieAgents({
    hostname: 'test-host',
    workspaceDir: '/home/user/project',
    sliceWorkspacePath: '/workspace',
    tools: stubTools(),
    config: { model: 'm' },
    makeAgent,
  });

  t.is(calls.length, 2, 'piAgent + heartbeatAgent');
  for (const call of calls) {
    t.is(
      call.sliceWorkspacePath,
      '/workspace',
      'each agent receives the slice path',
    );
    t.is(call.workspaceDir, '/home/user/project');
  }
});

test('makeGenieAgents — sliceWorkspacePath omitted when unset', async t => {
  /** @type {any[]} */
  const calls = [];
  const makeAgent = /** @type {any} */ (
    async (/** @type {any} */ opts) => {
      calls.push(opts);
      return { __stub: 'piAgent' };
    }
  );

  await makeGenieAgents({
    hostname: 'test-host',
    workspaceDir: '/home/user/project',
    tools: stubTools(),
    config: { model: 'm' },
    makeAgent,
  });

  t.is(calls.length, 2);
  for (const call of calls) {
    t.is(
      call.sliceWorkspacePath,
      undefined,
      'no slice-path key when caller did not set it',
    );
  }
});

// ---------------------------------------------------------------------------
// `buildGenieTools` — verifies the slice path appears in tool descriptions
// ---------------------------------------------------------------------------

test('buildGenieTools — bash tool help mentions the slice path when set', t => {
  /** @type {import('../../src/tools/spawner.js').Spawner} */
  const fakeSpawner = async () => {
    throw new Error('fake spawner not expected to run in this test');
  };
  const reg = buildGenieTools({
    workspaceDir: '/home/user/project',
    include: ['bash', 'exec'],
    spawner: fakeSpawner,
    sliceWorkspacePath: '/workspace',
  });
  const bashHelp = reg.tools.bash.help();
  t.regex(bashHelp, /\/workspace/);
  t.regex(bashHelp, /sandbox slice/i);
  const execHelp = reg.tools.exec.help();
  t.regex(execHelp, /\/workspace/);
});

test('buildGenieTools — bash tool help omits the slice path when unset', t => {
  // No spawner, no slice path: the registry reuses the pre-built bash
  // tool which by design has no slice-path string.
  const reg = buildGenieTools({
    workspaceDir: '/home/user/project',
    include: ['bash', 'exec'],
  });
  const bashHelp = reg.tools.bash.help();
  t.notRegex(bashHelp, /Workspace path:.*slice/i);
  t.notRegex(bashHelp, /sandbox slice/i);
});
