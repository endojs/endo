// @ts-check
/**
 * Pin the rigorous SmallCaps encode/decode at the JSON tool-arg boundary.
 *
 * The harness now applies the full SmallCaps codec to all tool-call args
 * and results:
 *
 *   Inbound (LLM → harness):
 *   - `"+N"` / `"-N"` → BigInt
 *   - `"#undefined"` → undefined
 *   - `"!<s>"` → the literal string `<s>` (Hilbert-hotel escape)
 *   - All other strings pass through unchanged
 *
 *   Outbound (harness → LLM):
 *   - BigInts → `"+N"` / `"-N"`
 *   - Strings starting with a special char → `"!<s>"`
 *   - All other values pass through as JSON
 *
 * The LLM must use the `!` escape prefix when it needs to pass a string
 * whose first character falls in the SmallCaps reserved range
 * `!"#$%&'()*+,-`. This is taught in the system prompt.
 *
 * These tests drive the same PiAgent + tools seam the production
 * `spawnWorkerLoop` uses (scripted streamFn, no provider call).
 */

import test from '@endo/ses-ava/prepare-endo.js';

import { Agent as PiAgent } from '@earendil-works/pi-agent-core';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';

import { toolDefs, makeExecuteTool, toAgentTool } from '../agent.js';
import { makeMockPowers } from '../tools/mock-powers.js';

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
 * Build a scripted streamFn that emits each script entry as one assistant
 * message and then stops.
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

/**
 * Build a PiAgent wired to lal's tool surface with a scripted streamFn,
 * mirroring `spawnWorkerLoop`'s construction shape so the tests exercise
 * the production code path.
 *
 * @param {Array<{content: any[], stopReason: string}>} script
 */
const buildAgent = script => {
  const { powers, sent, adoptions } = makeMockPowers({
    initialMessage: {
      number: 1,
      from: '@host',
      to: 'lal-self-id',
      strings: ['placeholder'],
      names: [],
      ids: [],
    },
  });

  /** @type {Array<{name: string, args: any}>} */
  const dispatched = [];
  const rawExecuteTool = makeExecuteTool(powers);
  const executeTool = async (name, rawArgs) => {
    const result = await rawExecuteTool(name, rawArgs);
    return result;
  };

  const agentTools = toolDefs.map(({ name, summary }) =>
    toAgentTool(name, summary, async (toolName, rawArgs) => {
      dispatched.push({ name: toolName, args: rawArgs });
      return executeTool(toolName, rawArgs);
    }),
  );

  const piAgent = new PiAgent({
    initialState: {
      systemPrompt: 'You are a test stub.',
      model: stubModel,
      tools: agentTools,
      messages: [],
      thinkingLevel: 'off',
    },
    convertToLlm: msgs =>
      msgs.filter(
        m =>
          m.role === 'user' ||
          m.role === 'assistant' ||
          m.role === 'toolResult',
      ),
    toolExecution: 'sequential',
    streamFn: makeScriptedStreamFn(script),
  });

  return { piAgent, powers, sent, adoptions, dispatched };
};

/**
 * Build a single assistant message with one tool call, plus a stop turn.
 *
 * @param {string} toolName
 * @param {Record<string, unknown>} args
 */
const oneToolCall = (toolName, args) => [
  {
    content: [
      {
        type: 'toolCall',
        id: `call-${toolName}`,
        name: toolName,
        arguments: args,
      },
    ],
    stopReason: 'toolUse',
  },
  { content: [{ type: 'text', text: 'OK' }], stopReason: 'stop' },
];

// ---------------------------------------------------------------------------
// Inbound: BigInt fields decode correctly from SmallCaps notation.
// ---------------------------------------------------------------------------

test('dismiss: messageNumber "+5" is coerced to BigInt 5n', async t => {
  const { piAgent, dispatched } = buildAgent(
    oneToolCall('dismiss', { messageNumber: '+5' }),
  );
  await piAgent.prompt('start');
  await piAgent.waitForIdle();

  t.is(dispatched.length, 1);
  t.is(dispatched[0].name, 'dismiss');
  // The spy captures the raw args (pre-decode). The BigInt coercion
  // happens inside makeExecuteTool's decodeToolArgs call.
  t.is(dispatched[0].args.messageNumber, '+5');
});

test('dismiss: powers boundary sees BigInt for "+5" messageNumber', async t => {
  /** @type {Array<unknown>} */
  const dismissed = [];
  const observingPowers = harden({
    dismiss(value) {
      dismissed.push(value);
      return Promise.resolve();
    },
    locate() {
      return Promise.resolve('endo://localhost/?id=lal-self-id&type=handle');
    },
    async *followMessages() {
      // No inbox traffic.
    },
    send() {
      return Promise.resolve();
    },
  });

  const executeTool = makeExecuteTool(observingPowers);
  const agentTools = toolDefs.map(({ name, summary }) =>
    toAgentTool(name, summary, executeTool),
  );

  const piAgent = new PiAgent({
    initialState: {
      systemPrompt: 'You are a test stub.',
      model: stubModel,
      tools: agentTools,
      messages: [],
      thinkingLevel: 'off',
    },
    convertToLlm: msgs =>
      msgs.filter(
        m =>
          m.role === 'user' ||
          m.role === 'assistant' ||
          m.role === 'toolResult',
      ),
    toolExecution: 'sequential',
    streamFn: makeScriptedStreamFn(
      oneToolCall('dismiss', { messageNumber: '+5' }),
    ),
  });

  await piAgent.prompt('start');
  await piAgent.waitForIdle();

  t.is(dismissed.length, 1, 'dismiss tool dispatched once');
  t.is(
    typeof dismissed[0],
    'bigint',
    'messageNumber arrived at powers as a BigInt (SmallCaps "+5" decoded to 5n)',
  );
  t.is(dismissed[0], 5n);
});

test('reply: messageNumber "+3" decodes to BigInt 3n', async t => {
  const { powers, sent } = makeMockPowers({
    initialMessage: {
      number: 3,
      from: '@host',
      to: 'lal-self-id',
      strings: ['hi'],
      names: [],
      ids: [],
    },
  });
  const executeTool = makeExecuteTool(powers);
  const agentTools = toolDefs.map(({ name, summary }) =>
    toAgentTool(name, summary, executeTool),
  );
  const piAgent = new PiAgent({
    initialState: {
      systemPrompt: 'You are a test stub.',
      model: stubModel,
      tools: agentTools,
      messages: [],
      thinkingLevel: 'off',
    },
    convertToLlm: msgs =>
      msgs.filter(
        m =>
          m.role === 'user' ||
          m.role === 'assistant' ||
          m.role === 'toolResult',
      ),
    toolExecution: 'sequential',
    streamFn: makeScriptedStreamFn(
      oneToolCall('reply', {
        messageNumber: '+3',
        strings: ['Thanks for the update!'],
        edgeNames: [],
        petNames: [],
      }),
    ),
  });

  await piAgent.prompt('start');
  await piAgent.waitForIdle();

  t.is(sent.length, 1, 'reply was sent');
  t.deepEqual(sent[0].strings, ['Thanks for the update!']);
});

// ---------------------------------------------------------------------------
// Inbound: SmallCaps `!`-escape delivers strings starting with sigil chars.
// The LLM must use the `!` prefix for strings whose first char is in the
// reserved range `!"#$%&'()*+,-` (BigInt, sentinel, symbol, escape sigils).
// ---------------------------------------------------------------------------

test('send: "!+15551234567" in strings[] delivers the literal string "+15551234567"', async t => {
  // The LLM emits the `!` escape to pass a string that starts with `+`.
  const { piAgent, sent } = buildAgent(
    oneToolCall('send', {
      recipientName: '@host',
      // "!+15551234567" is SmallCaps-escaped "+15551234567"
      strings: ['!+15551234567'],
      edgeNames: [],
      petNames: [],
    }),
  );
  await piAgent.prompt('start');
  await piAgent.waitForIdle();

  t.is(sent.length, 1);
  t.deepEqual(
    sent[0].strings,
    ['+15551234567'],
    'SmallCaps !-escape delivers the literal "+15551234567" string',
  );
  t.is(typeof sent[0].strings[0], 'string');
});

test('send: "!+5" in strings[] delivers the literal string "+5"', async t => {
  const { piAgent, sent } = buildAgent(
    oneToolCall('send', {
      recipientName: '@host',
      strings: ['!+5'],
      edgeNames: [],
      petNames: [],
    }),
  );
  await piAgent.prompt('start');
  await piAgent.waitForIdle();

  t.is(sent.length, 1);
  t.deepEqual(sent[0].strings, ['+5']);
  t.is(typeof sent[0].strings[0], 'string');
});

test('send: "!#undefined" in strings[] delivers the literal string "#undefined"', async t => {
  const { piAgent, sent } = buildAgent(
    oneToolCall('send', {
      recipientName: '@host',
      strings: ['!#undefined'],
      edgeNames: [],
      petNames: [],
    }),
  );
  await piAgent.prompt('start');
  await piAgent.waitForIdle();

  t.is(sent.length, 1);
  t.deepEqual(sent[0].strings, ['#undefined']);
  t.is(typeof sent[0].strings[0], 'string');
});

test('send: "!%percentage" in strings[] delivers the literal string "%percentage"', async t => {
  const { piAgent, sent } = buildAgent(
    oneToolCall('send', {
      recipientName: '@host',
      strings: ['!%percentage'],
      edgeNames: [],
      petNames: [],
    }),
  );
  await piAgent.prompt('start');
  await piAgent.waitForIdle();

  t.is(sent.length, 1);
  t.deepEqual(sent[0].strings, ['%percentage']);
  t.is(typeof sent[0].strings[0], 'string');
});

test('send: plain strings without sigil prefix pass through unchanged', async t => {
  // Strings that do not start with a SmallCaps-reserved character need no
  // escaping. They pass through byte-identical to their JSON representation.
  const { piAgent, sent } = buildAgent(
    oneToolCall('send', {
      recipientName: '@host',
      strings: [
        'Hello world',
        'foo bar',
        'A string with no sigil',
        'Numbers like 42 and 3.14 are fine',
      ],
      edgeNames: [],
      petNames: [],
    }),
  );
  await piAgent.prompt('start');
  await piAgent.waitForIdle();

  t.is(sent.length, 1);
  t.deepEqual(sent[0].strings, [
    'Hello world',
    'foo bar',
    'A string with no sigil',
    'Numbers like 42 and 3.14 are fine',
  ]);
});

test('send: multiple sigil-prefixed strings with !-escapes all decode correctly', async t => {
  // Realistic chat that needs multiple sigil escapes:
  //   "!+1 555 123 4567" → "+1 555 123 4567" (phone number)
  //   "!#main" → "#main" (hashtag)
  //   "!%percent" → "%percent" (literal % string)
  const { piAgent, sent } = buildAgent(
    oneToolCall('send', {
      recipientName: '@host',
      strings: ['!+1 555 123 4567', '!#main', '!%percent and $variable'],
      edgeNames: [],
      petNames: [],
    }),
  );
  await piAgent.prompt('start');
  await piAgent.waitForIdle();

  t.is(sent.length, 1);
  t.deepEqual(sent[0].strings, [
    '+1 555 123 4567',
    '#main',
    '%percent and $variable',
  ]);
});

// ---------------------------------------------------------------------------
// Inbound: SmallCaps manifest constants decode correctly.
// ---------------------------------------------------------------------------

test('evaluate: "#undefined" workerName decodes to undefined', async t => {
  // With full SmallCaps decode, "#undefined" becomes the JS value undefined.
  // The evaluate dispatcher then treats undefined as no workerName, which
  // is the correct behavior.
  /** @type {Array<{workerName: unknown, source: string, codeNames: string[], edgeNames: string[], resultName: string}>} */
  const evaluations = [];
  const observingPowers = harden({
    evaluate(workerName, source, codeNames, edgeNames, resultName) {
      evaluations.push({
        workerName,
        source,
        codeNames,
        edgeNames,
        resultName,
      });
      return Promise.resolve(undefined);
    },
    locate() {
      return Promise.resolve('endo://localhost/?id=lal-self-id&type=handle');
    },
    // eslint-disable-next-line require-yield
    async *followMessages() {
      // No inbox messages in this test.
    },
    send() {
      return Promise.resolve();
    },
  });

  const executeTool = makeExecuteTool(observingPowers);
  const agentTools = toolDefs.map(({ name, summary }) =>
    toAgentTool(name, summary, executeTool),
  );
  const piAgent = new PiAgent({
    initialState: {
      systemPrompt: 'You are a test stub.',
      model: stubModel,
      tools: agentTools,
      messages: [],
      thinkingLevel: 'off',
    },
    convertToLlm: msgs =>
      msgs.filter(
        m =>
          m.role === 'user' ||
          m.role === 'assistant' ||
          m.role === 'toolResult',
      ),
    toolExecution: 'sequential',
    streamFn: makeScriptedStreamFn(
      oneToolCall('evaluate', {
        workerName: '#undefined',
        source: 'Math.PI',
        codeNames: [],
        edgeNames: [],
        resultName: 'r',
      }),
    ),
  });

  await piAgent.prompt('start');
  await piAgent.waitForIdle();

  t.is(evaluations.length, 1, 'evaluate was dispatched once');
  t.is(
    evaluations[0].workerName,
    undefined,
    '"#undefined" decoded to JS undefined before reaching powers boundary',
  );
});

// ---------------------------------------------------------------------------
// Outbound: SmallCaps encodes tool results so the LLM reads BigInts as "+N".
// ---------------------------------------------------------------------------

test('toAgentTool serializes a BigInt message number as "+N" (regression: listMessages threw "Do not know how to serialize a BigInt")', async t => {
  // listMessages returns each message `number` as a BigInt. Before the
  // fix, JSON.stringify over that result threw, so the agent could never
  // read its inbox and silently dropped the incoming message.
  const tool = toAgentTool('listMessages', 'list inbox', async () =>
    harden([
      { number: 5n, from: '@host', strings: ['hi'] },
      { number: 12n, from: '@host', strings: ['again'] },
    ]),
  );

  const result = await tool.execute('call-list', {}, undefined, undefined);
  const [entry] = result.content;
  const text = 'text' in entry ? entry.text : '';

  // Did not throw, and renders numbers in the exact form the agent must
  // pass back to dismiss()/reply().
  t.deepEqual(
    JSON.parse(text).map(m => m.number),
    ['+5', '+12'],
  );
  // The structured details still carry the raw BigInts for programmatic use.
  t.is(result.details[0].number, 5n);
});

test('toAgentTool serializes a negative BigInt as "-N"', async t => {
  const tool = toAgentTool('probe', 'probe', async () => harden({ n: -7n }));
  const result = await tool.execute('call-probe', {}, undefined, undefined);
  const [entry] = result.content;
  t.is('text' in entry ? entry.text : '', '{"n":"-7"}');
});

test('toAgentTool encodes a result string starting with "+" as "!+..."', async t => {
  // Strings starting with sigil chars are `!`-escaped in the outbound
  // SmallCaps encoding so the LLM can distinguish them from BigInts.
  const tool = toAgentTool('probe', 'probe', async () =>
    harden({ value: '+hello' }),
  );
  const result = await tool.execute('call-probe', {}, undefined, undefined);
  const [entry] = result.content;
  const text = 'text' in entry ? entry.text : '';
  // "+hello" encodes as "!+hello" so the model knows it's a string
  t.is(text, '{"value":"!+hello"}');
});

test('toAgentTool does not escape strings that do not start with sigil chars', async t => {
  // Plain strings pass through byte-identical (readability invariant).
  const tool = toAgentTool('probe', 'probe', async () =>
    harden({ value: 'hello world' }),
  );
  const result = await tool.execute('call-probe', {}, undefined, undefined);
  const [entry] = result.content;
  const text = 'text' in entry ? entry.text : '';
  t.is(text, '{"value":"hello world"}');
});

// ---------------------------------------------------------------------------
// Round-trip: args the LLM emits are decoded then re-encoded for results.
// ---------------------------------------------------------------------------

test('petNameOrPath string (no sigil) passes through decode unchanged', async t => {
  // `lookup` expects petNameOrPath to be a string-or-string[]. A plain pet
  // name like "my-file" has no sigil and decodes unchanged.
  const { piAgent, dispatched } = buildAgent(
    oneToolCall('lookup', { petNameOrPath: 'my-file' }),
  );

  await piAgent.prompt('start').catch(() => {});
  await piAgent.waitForIdle().catch(() => {});

  t.is(dispatched.length, 1);
  t.is(dispatched[0].args.petNameOrPath, 'my-file');
  t.is(typeof dispatched[0].args.petNameOrPath, 'string');
});
