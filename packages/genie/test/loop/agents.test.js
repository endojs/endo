// @ts-check

/**
 * Tests for `makeGenieAgents` — the agent-pack factory.
 *
 * These tests pin the invariants described in
 * `PLAN/genie_loop_architecture.md` § "Agent pack" /
 * "Heartbeat ownership":
 *
 * - Every sub-agent is constructed with the same `workspaceDir`,
 *   `listTools` / `execTool`, and (for observer / reflector) the same
 *   `searchBackend` and `memoryGet` / `memorySet` / `memorySearch`
 *   references.
 * - Per-sub-agent model overrides (`observerModel` / `reflectorModel`
 *   / `heartbeatModel`) fall back to the baseline `model` when unset
 *   and shadow it when provided.
 * - `dedicatedHeartbeatAgent: false` aliases `heartbeatAgent` back to
 *   `piAgent` (the shared-agent debug escape hatch); the default
 *   (`true`) constructs a separate PiAgent.
 * - When `tools.memoryTools` is absent (e.g. dev-repl's `--no-tools`
 *   mode) the observer / reflector are `undefined`.
 *
 * The factory is tested with stub `makeAgent` / `makeObserverAgent` /
 * `makeReflectorAgent` so we do not depend on the model registry or
 * filesystem; see the `dev-repl.js` / `main.js` integration paths for
 * the real wiring.
 */

import '@endo/harden';

import test from 'ava';

import { makeGenieAgents } from '../../src/loop/agents.js';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

/**
 * Build a stub `makePiAgent` that records each invocation's options and
 * returns a sentinel object tagged with the call index so the caller
 * can distinguish `piAgent` vs `heartbeatAgent`.
 *
 * @returns {{
 *   makeAgent: (opts: any) => Promise<any>,
 *   calls: any[],
 * }}
 */
const stubMakeAgent = () => {
  /** @type {any[]} */
  const calls = [];
  const makeAgent = async (/** @type {any} */ opts) => {
    calls.push(opts);
    return { __stub: 'piAgent', callIndex: calls.length - 1, opts };
  };
  return { makeAgent, calls };
};

/**
 * Build a stub observer / reflector factory that records each
 * invocation's options.  Returns a sentinel object so tests can
 * compare references.
 *
 * @param {string} tag - Tag embedded in the sentinel (`'observer'` /
 *   `'reflector'`) for debugging test failures.
 * @returns {{
 *   make: (opts: any) => any,
 *   calls: any[],
 * }}
 */
const stubSubAgent = tag => {
  /** @type {any[]} */
  const calls = [];
  const make = (/** @type {any} */ opts) => {
    calls.push(opts);
    return { __stub: tag, callIndex: calls.length - 1, opts };
  };
  return { make, calls };
};

/**
 * Build a stub `GenieTools` shape sufficient for the agent-pack
 * factory — `listTools` / `execTool` are forwarded to the main /
 * heartbeat agents, and `memoryTools` / `searchBackend` are forwarded
 * to the observer / reflector.
 *
 * @param {{ withMemory?: boolean }} [options]
 */
const stubTools = ({ withMemory = true } = {}) => {
  const listTools = () => [];
  const execTool = async () => {
    throw new Error('execTool not expected in agent-pack tests');
  };
  const searchBackend = /** @type {any} */ ({ __stub: 'searchBackend' });
  const memoryGet = /** @type {any} */ ({ __stub: 'memoryGet' });
  const memorySet = /** @type {any} */ ({ __stub: 'memorySet' });
  const memorySearch = /** @type {any} */ ({ __stub: 'memorySearch' });
  const memoryTools = withMemory
    ? { memoryGet, memorySet, memorySearch, indexing: Promise.resolve() }
    : undefined;
  return /** @type {any} */ ({
    tools: {},
    listTools,
    execTool,
    memoryTools,
    searchBackend: withMemory ? searchBackend : undefined,
  });
};

// ---------------------------------------------------------------------------
// Shared-inputs guarantee
// ---------------------------------------------------------------------------

test('makeGenieAgents — every sub-agent sees the same workspaceDir', async t => {
  const { makeAgent, calls: agentCalls } = stubMakeAgent();
  const { make: makeObserverAgent, calls: observerCalls } =
    stubSubAgent('observer');
  const { make: makeReflectorAgent, calls: reflectorCalls } =
    stubSubAgent('reflector');

  const workspaceDir = '/tmp/workspace-xyz';
  await makeGenieAgents({
    hostname: 'test-host',
    workspaceDir,
    tools: stubTools(),
    config: { model: 'm' },
    makeAgent,
    makeObserverAgent,
    makeReflectorAgent,
  });

  t.is(agentCalls.length, 2, 'piAgent + heartbeatAgent');
  for (const call of agentCalls) {
    t.is(call.workspaceDir, workspaceDir);
  }
  t.is(observerCalls.length, 1);
  t.is(observerCalls[0].workspaceDir, workspaceDir);
  t.is(reflectorCalls.length, 1);
  t.is(reflectorCalls[0].workspaceDir, workspaceDir);
});

test('makeGenieAgents — main and heartbeat agents share listTools / execTool', async t => {
  const { makeAgent, calls } = stubMakeAgent();
  const tools = stubTools();
  await makeGenieAgents({
    hostname: 'test-host',
    workspaceDir: '/w',
    tools,
    config: { model: 'm' },
    makeAgent,
    makeObserverAgent: stubSubAgent('observer').make,
    makeReflectorAgent: stubSubAgent('reflector').make,
  });
  t.is(calls.length, 2);
  t.is(calls[0].listTools, tools.listTools);
  t.is(calls[0].execTool, tools.execTool);
  t.is(calls[1].listTools, tools.listTools);
  t.is(calls[1].execTool, tools.execTool);
});

test('makeGenieAgents — observer & reflector share searchBackend and memory tool refs', async t => {
  const { makeAgent } = stubMakeAgent();
  const { make: makeObserverAgent, calls: observerCalls } =
    stubSubAgent('observer');
  const { make: makeReflectorAgent, calls: reflectorCalls } =
    stubSubAgent('reflector');
  const tools = stubTools();
  await makeGenieAgents({
    hostname: 'test-host',
    workspaceDir: '/w',
    tools,
    config: { model: 'm' },
    makeAgent,
    makeObserverAgent,
    makeReflectorAgent,
  });

  t.is(observerCalls[0].searchBackend, tools.searchBackend);
  t.is(reflectorCalls[0].searchBackend, tools.searchBackend);
  t.is(observerCalls[0].memoryGet, tools.memoryTools.memoryGet);
  t.is(reflectorCalls[0].memoryGet, tools.memoryTools.memoryGet);
  t.is(observerCalls[0].memorySet, tools.memoryTools.memorySet);
  t.is(reflectorCalls[0].memorySet, tools.memoryTools.memorySet);
  // Only the reflector needs memorySearch.
  t.is(reflectorCalls[0].memorySearch, tools.memoryTools.memorySearch);
});

// ---------------------------------------------------------------------------
// Model override precedence
// ---------------------------------------------------------------------------

test('makeGenieAgents — unspecified sub-agent models fall back to baseline', async t => {
  const { makeAgent, calls: agentCalls } = stubMakeAgent();
  const { make: makeObserverAgent, calls: observerCalls } =
    stubSubAgent('observer');
  const { make: makeReflectorAgent, calls: reflectorCalls } =
    stubSubAgent('reflector');

  await makeGenieAgents({
    hostname: 'test-host',
    workspaceDir: '/w',
    tools: stubTools(),
    config: { model: 'baseline-model' },
    makeAgent,
    makeObserverAgent,
    makeReflectorAgent,
  });

  // piAgent (index 0) + heartbeatAgent (index 1)
  t.is(agentCalls[0].model, 'baseline-model');
  t.is(agentCalls[1].model, 'baseline-model');
  t.is(observerCalls[0].model, 'baseline-model');
  t.is(reflectorCalls[0].model, 'baseline-model');
});

test('makeGenieAgents — per-sub-agent overrides shadow the baseline', async t => {
  const { makeAgent, calls: agentCalls } = stubMakeAgent();
  const { make: makeObserverAgent, calls: observerCalls } =
    stubSubAgent('observer');
  const { make: makeReflectorAgent, calls: reflectorCalls } =
    stubSubAgent('reflector');

  await makeGenieAgents({
    hostname: 'test-host',
    workspaceDir: '/w',
    tools: stubTools(),
    config: {
      model: 'baseline-model',
      observerModel: 'observer-model',
      reflectorModel: 'reflector-model',
      heartbeatModel: 'heartbeat-model',
    },
    makeAgent,
    makeObserverAgent,
    makeReflectorAgent,
  });

  t.is(agentCalls[0].model, 'baseline-model', 'piAgent keeps baseline');
  t.is(agentCalls[1].model, 'heartbeat-model', 'heartbeatAgent shadows');
  t.is(observerCalls[0].model, 'observer-model');
  t.is(reflectorCalls[0].model, 'reflector-model');
});

test('makeGenieAgents — partial overrides leave unspecified sub-agents on the baseline', async t => {
  const { makeAgent, calls: agentCalls } = stubMakeAgent();
  const { make: makeObserverAgent, calls: observerCalls } =
    stubSubAgent('observer');
  const { make: makeReflectorAgent, calls: reflectorCalls } =
    stubSubAgent('reflector');

  await makeGenieAgents({
    hostname: 'test-host',
    workspaceDir: '/w',
    tools: stubTools(),
    config: {
      model: 'baseline-model',
      observerModel: 'observer-model',
      // reflectorModel / heartbeatModel unset -> fall back to baseline
    },
    makeAgent,
    makeObserverAgent,
    makeReflectorAgent,
  });

  t.is(agentCalls[0].model, 'baseline-model');
  t.is(agentCalls[1].model, 'baseline-model');
  t.is(observerCalls[0].model, 'observer-model');
  t.is(reflectorCalls[0].model, 'baseline-model');
});

test('makeGenieAgents — missing baseline leaves every sub-agent undefined', async t => {
  const { makeAgent, calls: agentCalls } = stubMakeAgent();
  const { make: makeObserverAgent, calls: observerCalls } =
    stubSubAgent('observer');
  const { make: makeReflectorAgent, calls: reflectorCalls } =
    stubSubAgent('reflector');

  await makeGenieAgents({
    hostname: 'test-host',
    workspaceDir: '/w',
    tools: stubTools(),
    // No `config` at all
    makeAgent,
    makeObserverAgent,
    makeReflectorAgent,
  });

  t.is(agentCalls[0].model, undefined);
  t.is(agentCalls[1].model, undefined);
  t.is(observerCalls[0].model, undefined);
  t.is(reflectorCalls[0].model, undefined);
});

// ---------------------------------------------------------------------------
// Heartbeat ownership
// ---------------------------------------------------------------------------

test('makeGenieAgents — dedicatedHeartbeatAgent defaults to true (separate PiAgent)', async t => {
  const { makeAgent, calls } = stubMakeAgent();
  const { piAgent, heartbeatAgent } = await makeGenieAgents({
    hostname: 'test-host',
    workspaceDir: '/w',
    tools: stubTools(),
    config: { model: 'm' },
    makeAgent,
    makeObserverAgent: stubSubAgent('observer').make,
    makeReflectorAgent: stubSubAgent('reflector').make,
  });

  t.is(calls.length, 2, 'two PiAgent constructions');
  t.not(piAgent, heartbeatAgent, 'distinct agents by default');
});

test('makeGenieAgents — dedicatedHeartbeatAgent: false aliases heartbeatAgent to piAgent', async t => {
  const { makeAgent, calls } = stubMakeAgent();
  const { piAgent, heartbeatAgent } = await makeGenieAgents({
    hostname: 'test-host',
    workspaceDir: '/w',
    tools: stubTools(),
    config: { model: 'm', dedicatedHeartbeatAgent: false },
    makeAgent,
    makeObserverAgent: stubSubAgent('observer').make,
    makeReflectorAgent: stubSubAgent('reflector').make,
  });

  t.is(calls.length, 1, 'only the main PiAgent is constructed');
  t.is(heartbeatAgent, piAgent, 'heartbeatAgent aliases piAgent');
});

// ---------------------------------------------------------------------------
// Memory-less pack (dev-repl --no-tools parity)
// ---------------------------------------------------------------------------

test('makeGenieAgents — omits observer/reflector when memoryTools is absent', async t => {
  const { makeAgent } = stubMakeAgent();
  const { make: makeObserverAgent, calls: observerCalls } =
    stubSubAgent('observer');
  const { make: makeReflectorAgent, calls: reflectorCalls } =
    stubSubAgent('reflector');

  const result = await makeGenieAgents({
    hostname: 'test-host',
    workspaceDir: '/w',
    tools: stubTools({ withMemory: false }),
    config: { model: 'm' },
    makeAgent,
    makeObserverAgent,
    makeReflectorAgent,
  });

  t.is(result.observer, undefined);
  t.is(result.reflector, undefined);
  t.is(observerCalls.length, 0);
  t.is(reflectorCalls.length, 0);
});
