// @ts-check
import test from '@endo/ses-ava/prepare-endo.js';
import { setTimeout as delay } from 'node:timers/promises';
import { makeBufferedReader } from '@endo/exo-stream/buffered-channel.js';

import {
  makeClaudeEventTranslator,
  runClaudeTurn,
} from '../src/claude-turn.js';

// A writer that records every ReplyEvent call, in order.
const makeRecordingWriter = () => {
  /** @type {Array<{ kind: string, payload?: unknown }>} */
  const log = [];
  const writer = harden({
    setPhase: phase => log.push({ kind: 'phase', payload: phase }),
    delta: text => log.push({ kind: 'delta', payload: text }),
    final: text => log.push({ kind: 'final', payload: text }),
    toolCall: call => log.push({ kind: 'tool_call', payload: call }),
    toolResult: result => log.push({ kind: 'tool_result', payload: result }),
    usage: totals => log.push({ kind: 'usage', payload: totals }),
    end: () => log.push({ kind: 'end' }),
    abort: reason => log.push({ kind: 'abort', payload: reason }),
  });
  return { writer, log };
};

// A fake ClaudeClient whose send() returns a buffered reader the test feeds.
const makeFakeClient = () => {
  const { push, reader, setOnClose } = makeBufferedReader();
  let killed = 0;
  setOnClose(() => {
    killed += 1;
  });
  /** @type {string[]} */
  const prompts = [];
  /** @type {object[]} */
  const options = [];
  const client = harden({
    async send(prompt, opts) {
      prompts.push(prompt);
      options.push(opts);
      return reader;
    },
  });
  return { client, push, prompts, options, killed: () => killed };
};

test('translator maps stream-json events onto the reply wire', async t => {
  const { writer, log } = makeRecordingWriter();
  const translator = makeClaudeEventTranslator(writer);

  translator.handle({ type: 'system', subtype: 'init' });
  translator.handle({
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: 'Let me check. ' },
        { type: 'tool_use', id: 'toolu_1', name: 'Read', input: { path: 'a' } },
      ],
    },
  });
  translator.handle({
    type: 'user',
    message: {
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'toolu_1',
          content: [{ type: 'text', text: 'file contents' }],
        },
      ],
    },
  });
  translator.handle({
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'Done.' }] },
  });
  translator.handle({
    type: 'result',
    subtype: 'success',
    result: 'Checked the file: done.',
    num_turns: 2,
    usage: { input_tokens: 11, output_tokens: 7 },
  });

  t.deepEqual(log, [
    { kind: 'phase', payload: 'claude session starting' },
    { kind: 'delta', payload: 'Let me check. ' },
    {
      kind: 'tool_call',
      payload: { id: 'toolu_1', name: 'Read', args: '{"path":"a"}' },
    },
    {
      kind: 'tool_result',
      payload: { id: 'toolu_1', name: 'Read', result: 'file contents' },
    },
    { kind: 'delta', payload: 'Done.' },
  ]);
  t.deepEqual(translator.finish(), {
    finalText: 'Checked the file: done.',
    usage: { inputTokens: 11, outputTokens: 7 },
    errorReason: undefined,
  });
});

test('translator falls back to streamed text without a result summary', async t => {
  const { writer } = makeRecordingWriter();
  const translator = makeClaudeEventTranslator(writer);
  translator.handle({
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'Hello ' }] },
  });
  translator.handle({
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'world' }] },
  });
  t.deepEqual(translator.finish(), {
    finalText: 'Hello world',
    usage: undefined,
    errorReason: undefined,
  });
});

test('runClaudeTurn streams a full turn end to end', async t => {
  const { writer, log } = makeRecordingWriter();
  const { client, push, prompts } = makeFakeClient();

  const turn = runClaudeTurn({ client, text: 'do the thing', writer });
  push({
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'On it.' }] },
  });
  push({
    type: 'result',
    subtype: 'success',
    result: 'The thing is done.',
    usage: { input_tokens: 3, output_tokens: 2 },
  });
  push({ type: 'end' });

  const { finalContent, usage } = await turn;
  t.deepEqual(prompts, ['do the thing']);
  t.is(finalContent, 'The thing is done.');
  t.deepEqual(usage, { inputTokens: 3, outputTokens: 2 });
  t.deepEqual(log, [{ kind: 'delta', payload: 'On it.' }]);
});

test('an in-band abort event rejects the turn', async t => {
  const { writer } = makeRecordingWriter();
  const { client, push } = makeFakeClient();
  const turn = runClaudeTurn({ client, text: 'hi', writer });
  push({ type: 'abort', reason: 'claude exploded' });
  await t.throwsAsync(() => turn, { message: /claude exploded/ });
});

test('a failed result raises instead of completing as success', async t => {
  const { writer } = makeRecordingWriter();
  const { client, push } = makeFakeClient();
  const turn = runClaudeTurn({ client, text: 'hi', writer });
  // error_max_turns carries no `result` text — the failure is signalled only
  // by is_error, which must not read as a successful (empty) answer.
  push({ type: 'result', subtype: 'error_max_turns', is_error: true });
  push({ type: 'end' });
  await t.throwsAsync(() => turn, { message: /error_max_turns/ });
});

test('a failed result with text reports that text as the reason', async t => {
  const { writer } = makeRecordingWriter();
  const { client, push } = makeFakeClient();
  const turn = runClaudeTurn({ client, text: 'hi', writer });
  push({
    type: 'result',
    subtype: 'error_during_execution',
    result: 'credential expired',
    is_error: true,
  });
  push({ type: 'end' });
  await t.throwsAsync(() => turn, { message: /credential expired/ });
});

test('the model option reaches the client', async t => {
  const { writer } = makeRecordingWriter();
  const { client, push, options } = makeFakeClient();
  const turn = runClaudeTurn({
    client,
    text: 'hi',
    writer,
    model: 'claude-opus-4-8',
  });
  push({ type: 'end' });
  await turn;
  t.deepEqual(options, [{ model: 'claude-opus-4-8' }]);
});

test('aborting the signal closes the reader and kills the turn', async t => {
  const { writer } = makeRecordingWriter();
  const { client, push, killed } = makeFakeClient();
  const controller = new AbortController();

  const turn = runClaudeTurn({
    client,
    text: 'hi',
    writer,
    signal: controller.signal,
  });
  push({
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'partial' }] },
  });
  // Let the turn consume the delta, then stop pulling — the producer is idle,
  // which is exactly the case the live close watcher exists for.
  await delay(10);
  controller.abort();

  const { finalContent } = await turn;
  t.is(finalContent, 'partial');
  t.is(killed(), 1);
});
