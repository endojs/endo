// @ts-check

import '@endo/init/debug.js';

import test from 'ava';
import fs from 'node:fs';
import url from 'node:url';

import { findMockTrace, makeMockProvider } from '@endo/lal/providers/index.js';
import { makeMockPowers } from '@endo/lal/tools/mock-powers.js';

import { spawnWorkerLoop } from '../agent.js';
import { make as makeRealMathTool } from '../tools/math.js';

const fixturePath = url.fileURLToPath(
  new URL('../../lal/test/fixtures/llm-provider-traces.json', import.meta.url),
);

const loadFixtures = () => JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

/**
 * Derive the ordered list of tool names actually invoked across all
 * rounds of a fixture trace. Used to check that the static
 * `expectedToolNames` declaration stays in sync with the trace data.
 *
 * @param {ReturnType<typeof findMockTrace>} trace
 * @returns {string[]}
 */
const actualToolCallNames = trace =>
  (trace.rounds || []).flatMap(round => {
    const toolCalls =
      /** @type {{ function: { name: string } }[]} */ (
        /** @type {any} */ (round.response.message).tool_calls
      ) || [];
    return toolCalls.map(call => call.function.name);
  });

// Wrap the real math tool (packages/fae/tools/math.js) so a change to its
// schema or arithmetic actually surfaces here. Wrapping is only to capture
// each execute() call for assertions; semantics come from the real tool.
const makeTrackedMathTool = executions => {
  const realTool = makeRealMathTool(undefined);
  return harden({
    schema: () => realTool.schema(),
    async execute(args) {
      executions.push(args);
      return realTool.execute(args);
    },
    help: () => realTool.help(),
  });
};

// Marked test.failing because the fixture's adoption + tool-turn flow
// is fully wired only by endojs/endo-but-for-bots#298's attachment-driven
// tool-turn hardening; on this PR the worker loop does not yet drive the
// replayed trace to completion.
test.failing(
  'current fixture replays Fae attachment adoption through mock provider',
  async t => {
    const trace = findMockTrace(loadFixtures(), 'fae.current.math-tool');
    t.deepEqual(
      actualToolCallNames(trace),
      trace.expectedToolNames,
      'fixture rounds should invoke exactly the declared expectedToolNames',
    );

    /** @type {Array<Record<string, unknown>>} */
    const toolExecutions = [];
    const mathTool = makeTrackedMathTool(toolExecutions);
    const attachments = new Map([['math-tool-id', mathTool]]);

    const initialMessage = harden({
      number: 1,
      type: 'package',
      from: '@host',
      to: 'lal-self-id',
      messageId: 'mock-fae-msg-1',
      strings: [
        'Here is a math tool ',
        '. Adopt it, then use it to compute 7 * 6 and reply with just the number.',
      ],
      names: ['math-tool'],
      ids: ['math-tool-id'],
    });

    const { powers, sent, adoptions } = makeMockPowers({
      initialMessage,
      attachments,
    });

    await spawnWorkerLoop(powers, null, {
      provider: makeMockProvider({ trace }),
    });

    t.deepEqual(adoptions, [
      { messageNumber: '1', edgeName: 'math-tool', petName: 'tools/math-tool' },
    ]);
    t.deepEqual(toolExecutions, [{ b: 6, a: 7, operation: 'multiply' }]);

    const replies = sent.filter(record => record.replyTo !== undefined);
    t.true(
      replies.some(reply =>
        /** @type {string[]} */ (reply.strings).join('').includes('42'),
      ),
      'fixture should drive Fae to reply with the math result',
    );
  },
);

test('fixtures capture current prompt improvement over llm tip', async t => {
  const fixtures = loadFixtures();
  const before = findMockTrace(fixtures, 'fae.llm-tip.math-tool');
  const after = findMockTrace(fixtures, 'fae.current.math-tool');

  const beforeRounds = before.rounds || [];
  const afterRounds = after.rounds || [];
  const beforeCall = /** @type {any} */ (beforeRounds[0].response.message)
    .tool_calls[0];
  const afterCall = /** @type {any} */ (afterRounds[0].response.message)
    .tool_calls[0];
  t.is(beforeCall.function.name, 'adoptTool');
  t.is(afterCall.function.name, 'adoptTool');
  t.is(JSON.parse(beforeCall.function.arguments).edgeName, 'math');
  t.is(JSON.parse(afterCall.function.arguments).edgeName, 'math-tool');
});

// Marked test.failing because the assertion targets the *intended*
// behavior: with a sufficiently descriptive prompt the model should
// adopt the actual attachment edge ("math-tool"), not guess at a
// shorter name ("math"). The fae.llm-tip.math-tool fixture captures
// what the older prompt actually produced, so this assertion will
// fail until somebody re-captures the trace against a newer model or
// prompt. Keeping it as test.failing documents the prompt fix that
// landed in the fae.current.math-tool fixture without forcing a
// hidden skip.
test.failing(
  'older prompt without attached-references block adopts the right edge',
  async t => {
    const before = findMockTrace(loadFixtures(), 'fae.llm-tip.math-tool');
    const beforeRounds = before.rounds || [];
    const beforeCall = /** @type {any} */ (beforeRounds[0].response.message)
      .tool_calls[0];
    t.is(JSON.parse(beforeCall.function.arguments).edgeName, 'math-tool');
  },
);
