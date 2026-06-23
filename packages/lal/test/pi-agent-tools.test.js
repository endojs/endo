// @ts-check
/**
 * Pin the new boundary between `PiAgent` (from `@earendil-works/pi-agent-core`)
 * and lal's tool surface (`toolDefs` + `makeExecuteTool` in `agent.js`).
 *
 * The harness migration moved provider/normalization logic into pi-agent-core
 * (#292) and message shaping into pi-ai (#293), so the pre-migration
 * normalization tests were removed (commit 4e6ed35). This test exercises what
 * remains lal-owned at the new seam: the full SmallCaps decode (via
 * `decodeToolArgs` in `agent.js`), the `@endo/patterns` validation, and the
 * JSON-encoded-string retry path that `decodeToolArgs`'s secondary fallback
 * provides for smaller LLMs.
 *
 * Per the directive on #290 (2026-05-19):
 *   "add a test that stubs convertToLlm and scripts two tool calls
 *    (one normal, one with a JSON-encoded-string arg to hit the
 *    JSON-string retry)."
 *
 * Strategy: construct a `PiAgent` the same way `spawnWorkerLoop` does (same
 * `convertToLlm`, same tool surface built from `toolDefs` + `makeExecuteTool`
 * + `toAgentTool`), but supply a scripted `streamFn` so no provider is
 * called. The scripted stream emits one assistant turn carrying two tool
 * calls (one normal, one with a JSON-encoded-string arg to hit the retry)
 * and a second assistant turn that stops. We then assert on the mock powers
 * that both tool calls landed with the expected (decoded, validated) arguments.
 */

import test from '@endo/ses-ava/prepare-endo.js';

import { Agent as PiAgent } from '@earendil-works/pi-agent-core';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';

import { toolDefs, makeExecuteTool, toAgentTool } from '../agent.js';
import { makeMockPowers } from '../tools/mock-powers.js';

/**
 * Minimal pi-ai Model placeholder. The scripted streamFn ignores the model;
 * pi-agent-core only reads `api`, `provider`, and `id` for diagnostic
 * fields on the resulting AssistantMessage.
 */
/** @type {any} */
const stubModel = harden({
  id: 'stub-model',
  name: 'stub/stub-model',
  api: 'openai-completions',
  provider: 'openai',
  baseUrl: 'http://invalid.example',
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 4096,
  maxTokens: 1024,
});

/**
 * Build a scripted streamFn that yields a fresh AssistantMessage for each
 * LLM call from a pre-recorded queue. When the queue is exhausted, returns
 * a stop-only assistant message so the agent loop terminates cleanly.
 *
 * @param {Array<{content: any[], stopReason: string}>} script
 */
const makeScriptedStreamFn = script => {
  let turn = 0;
  return (_model, _context, _options) => {
    const stream = createAssistantMessageEventStream();
    /** @type {any} */
    const partial = harden({
      role: 'assistant',
      content: [],
      api: stubModel.api,
      provider: stubModel.provider,
      model: stubModel.id,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: 'stop',
      timestamp: Date.now(),
    });
    const next = script[turn] || {
      content: [{ type: 'text', text: 'done' }],
      stopReason: 'stop',
    };
    turn += 1;
    /** @type {any} */
    const finalMessage = harden({
      ...partial,
      content: next.content,
      stopReason: next.stopReason,
    });
    // Per the AssistantMessageEvent contract, emit `start` (so the loop
    // attaches the partial), then `done` with the final message.
    stream.push({ type: 'start', partial });
    stream.push({
      type: 'done',
      reason: /** @type {'toolUse' | 'stop'} */ (
        next.stopReason === 'toolUse' ? 'toolUse' : 'stop'
      ),
      message: finalMessage,
    });
    stream.end(finalMessage);
    return stream;
  };
};

test('PiAgent + lal tools: normal arg dispatch + decodeToolArgs JSON-string retry', async t => {
  // Track which lal-tool dispatches receive what arguments by wrapping the
  // executeTool with a spy. The mock powers record observable side effects
  // (sent records, removed pet names) separately; the spy lets us assert on
  // the *validated* args record the tool dispatcher saw.
  const { powers, sent } = makeMockPowers({
    initialMessage: {
      number: 1,
      from: '@host',
      to: 'lal-self-id',
      strings: ['placeholder; this test drives PiAgent directly'],
      names: [],
      ids: [],
    },
  });

  // Seed the directory with two pet names so `move(['source-name'],
  // ['destination-name'])` is a legitimate operation against the mock.
  await powers.makeDirectory(['source-name']);

  /** @type {Array<{name: string, rawArgs: any}>} */
  const dispatched = [];
  const rawExecuteTool = makeExecuteTool(powers);
  const executeTool = async (name, rawArgs) => {
    dispatched.push({ name, rawArgs });
    return rawExecuteTool(name, rawArgs);
  };

  const agentTools = toolDefs.map(({ name, summary }) =>
    toAgentTool(name, summary, executeTool),
  );

  // Script two assistant turns:
  //   Turn 1: emit two tool calls in one assistant message:
  //     - `send` with NORMAL args (strings is already an array).
  //     - `move` with JSON-ENCODED-STRING args (fromPath/toPath are
  //       JSON-encoded arrays). After SmallCaps decode, fromPath is still a
  //       string like '["source-name"]' (not a sigil string, so it passes
  //       through SmallCaps unchanged). The first @endo/patterns match against
  //       NamePathShape (M.arrayOf(M.string())) fails for a string; the
  //       JSON-string retry in decodeToolArgs parses the strings and
  //       re-matches successfully.
  //   Turn 2: stop with no further tool calls so the agent loop ends.
  const streamFn = makeScriptedStreamFn([
    {
      content: [
        {
          type: 'toolCall',
          id: 'call-1-send',
          name: 'send',
          arguments: {
            recipientName: '@host',
            strings: ['hello from the test'],
            edgeNames: [],
            petNames: [],
          },
        },
        {
          type: 'toolCall',
          id: 'call-2-move',
          name: 'move',
          // Both path fields delivered as JSON-encoded strings. Some smaller
          // models do this in practice; without the retry the first
          // mustMatch against M.arrayOf(M.string()) throws.
          arguments: {
            fromPath: '["source-name"]',
            toPath: '["destination-name"]',
          },
        },
      ],
      stopReason: 'toolUse',
    },
    // Second LLM turn after tool results: stop.
    {
      content: [{ type: 'text', text: 'OK' }],
      stopReason: 'stop',
    },
  ]);

  const piAgent = new PiAgent({
    initialState: {
      systemPrompt: 'You are a test stub.',
      model: stubModel,
      tools: agentTools,
      messages: [],
      thinkingLevel: 'off',
    },
    // The reviewer asked specifically for a `convertToLlm` stub; supply the
    // same identity-filter the production `spawnWorkerLoop` installs so the
    // test exercises the same path.
    convertToLlm: msgs =>
      msgs.filter(
        m =>
          m.role === 'user' ||
          m.role === 'assistant' ||
          m.role === 'toolResult',
      ),
    toolExecution: 'sequential',
    streamFn,
  });

  await piAgent.prompt('start');
  await piAgent.waitForIdle();

  // The send tool's normal-arg path should have fired and reached the mock
  // powers. mock-powers records `send`s in `sent`. This proves the
  // normal-args validation path (first @endo/patterns match succeeds; no
  // retry needed) drives the dispatcher through to the powers boundary.
  const sentToHost = sent.filter(s => s.recipient === '@host');
  t.is(sentToHost.length, 1, 'send tool dispatched once');
  t.deepEqual(
    sentToHost[0].strings,
    ['hello from the test'],
    'normal-arg send delivered exact strings array',
  );

  // Both tools were invoked at the executeTool seam, in source order, with
  // the *raw* (pre-fixup) arguments pi-agent-core forwarded from the
  // scripted assistant message.
  t.is(dispatched.length, 2, 'both tool calls dispatched');
  t.is(dispatched[0].name, 'send', 'first dispatch is send');
  t.is(dispatched[1].name, 'move', 'second dispatch is move');
  t.is(
    typeof dispatched[1].rawArgs.fromPath,
    'string',
    'move received the raw JSON-encoded-string args from the scripted stream',
  );

  // The retry-path proof is in the side effect on mock-powers. The mock's
  // `move(fromPath, toPath)` calls `fromPath.join('/')`, which throws on a
  // string. If decodeToolArgs's JSON-string retry had *not* fixed up the
  // JSON-encoded strings into arrays, the inner dispatcher would have
  // surfaced that error and the destination pet name would never have been
  // written. Confirming both pet names below proves the retry parsed each
  // JSON-encoded array and re-matched before the switch dispatched into
  // E(powers).move(...).
  t.true(
    await powers.has('destination-name'),
    'move tool installed destination pet name in directory (proves retry succeeded)',
  );
  t.false(
    await powers.has('source-name'),
    'move tool removed source pet name from directory (proves retry succeeded)',
  );
});
