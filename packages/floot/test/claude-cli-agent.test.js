// @ts-check
// The claude-cli branch of makeStreamingAgent: a session whose turns run
// against a ClaudeClient capability instead of a streaming API provider.
import test from '@endo/ses-ava/prepare-endo.js';
import { makeBufferedReader } from '@endo/exo-stream/buffered-channel.js';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

import { makeStreamingAgent } from '../agent.js';
import { makeReplyChannel } from '../src/stream.js';

// A minimal in-memory stand-in for a session guest's petstore powers: the
// surface makeEndoPetstoreBackend and the usage counter actually use.
const makeFakePowers = () => {
  /** @type {Map<string, unknown>} */
  const store = new Map();
  return harden({
    async storeValue(value, petName) {
      const name = Array.isArray(petName) ? petName.join('.') : petName;
      if (store.has(name)) throw Error(`already stored: ${name}`);
      store.set(name, value);
    },
    async lookup(petName) {
      const name = Array.isArray(petName) ? petName.join('.') : petName;
      if (!store.has(name)) throw Error(`not found: ${name}`);
      return store.get(name);
    },
    async has(petName) {
      const name = Array.isArray(petName) ? petName.join('.') : petName;
      return store.has(name);
    },
    async remove(petName) {
      const name = Array.isArray(petName) ? petName.join('.') : petName;
      store.delete(name);
    },
    async list() {
      return harden([...store.keys()]);
    },
    async followMessages() {
      // The inbox loop is not started in these tests.
      return harden({ [Symbol.asyncIterator]: () => harden({}) });
    },
  });
};

// A ClaudeClient stand-in: each send() hands back a fresh buffered reader that
// the test drives, mirroring the real per-turn reply wire.
const makeFakeClient = () => {
  /** @type {Array<{ push: (event: object) => void, killed: () => boolean }>} */
  const turns = [];
  const client = harden({
    async send() {
      let killed = false;
      const { push, reader, setOnClose } = makeBufferedReader();
      setOnClose(() => {
        killed = true;
      });
      turns.push({ push, killed: () => killed });
      return reader;
    },
  });
  return { client, turns };
};

// Drain a reply reader into a list of events (the shape the UI consumes).
const collectReply = async reader => {
  const events = [];
  for await (const value of iterateReader(reader)) {
    events.push(value);
  }
  return events;
};

test('a claude-cli turn persists history and folds usage', async t => {
  t.timeout(20_000);
  const powers = makeFakePowers();
  const { client, turns } = makeFakeClient();
  const agent = await makeStreamingAgent(
    powers,
    undefined,
    { claudeClient: client },
    'test prompt',
  );

  const { writer, reader } = makeReplyChannel();
  const replyP = collectReply(reader);
  const turnP = agent.converse('build the thing', writer);

  // Wait for the client to receive the turn, then drive its reply.
  for (let i = 0; i < 50 && turns.length === 0; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await null;
  }
  t.is(turns.length, 1);
  turns[0].push({
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'building' }] },
  });
  turns[0].push({
    type: 'result',
    subtype: 'success',
    result: 'Built the thing.',
    usage: { input_tokens: 20, output_tokens: 5 },
  });
  turns[0].push({ type: 'end' });

  await turnP;
  const events = await replyP;
  t.deepEqual(
    events.map(e => e.type),
    ['phase', 'delta', 'usage', 'final', 'end'],
    'the reply wire carries the same shape as an API-backed turn',
  );
  t.deepEqual(events.at(-2), { type: 'final', text: 'Built the thing.' });
  t.deepEqual(events.at(-3), {
    type: 'usage',
    inputTokens: 20,
    outputTokens: 5,
    turns: 1,
  });

  const history = await agent.getHistory();
  t.deepEqual(
    history.map(m => [m.role, m.content]),
    [
      ['user', 'build the thing'],
      ['assistant', 'Built the thing.'],
    ],
    'the CLI turn is persisted like any other',
  );
  t.deepEqual(await agent.getUsage(), {
    inputTokens: 20,
    outputTokens: 5,
    turns: 1,
  });
});

test('a failed claude-cli turn aborts the reply and persists nothing', async t => {
  t.timeout(20_000);
  const powers = makeFakePowers();
  const { client, turns } = makeFakeClient();
  const agent = await makeStreamingAgent(
    powers,
    undefined,
    { claudeClient: client },
    'test prompt',
  );

  const { writer, reader } = makeReplyChannel();
  const replyP = collectReply(reader);
  const turnP = agent.converse('do it', writer);
  for (let i = 0; i < 50 && turns.length === 0; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await null;
  }
  turns[0].push({ type: 'result', subtype: 'error_max_turns', is_error: true });
  turns[0].push({ type: 'end' });

  await t.throwsAsync(() => turnP, { message: /error_max_turns/ });
  const events = await replyP;
  t.is(events.at(-1)?.type, 'abort', 'the consumer learns the turn failed');

  // No assistant turn is persisted, and the failed turn leaves the active
  // branch where it was: `cachedLeaf` only advances on success, so the
  // orphaned user node is off-branch and the next turn starts from the same
  // point. This mirrors the API-backed path exactly (both only commit the
  // leaf after a completed turn).
  t.deepEqual(await agent.getHistory(), []);
  t.deepEqual(await agent.getUsage(), {
    inputTokens: 0,
    outputTokens: 0,
    turns: 0,
  });
});

test('stopping the reply kills the in-flight CLI turn', async t => {
  t.timeout(20_000);
  const powers = makeFakePowers();
  const { client, turns } = makeFakeClient();
  const agent = await makeStreamingAgent(
    powers,
    undefined,
    { claudeClient: client },
    'test prompt',
  );

  const controller = new AbortController();
  const { writer, reader } = makeReplyChannel(() => controller.abort());
  const replies = iterateReader(reader);
  const turnP = agent.converse(
    'long task',
    writer,
    undefined,
    controller.signal,
  );
  for (let i = 0; i < 50 && turns.length === 0; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await null;
  }
  turns[0].push({
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'working' }] },
  });
  t.deepEqual(await replies.next(), {
    value: { type: 'phase', phase: 'thinking' },
    done: false,
  });

  // The UI stops pulling: the reply channel's onClose aborts the signal, which
  // closes the CLI reader and kills the sandboxed turn.
  await replies.return();
  await turnP;
  t.true(turns[0].killed(), 'the in-flight claude -p was killed');

  // As on the API path, an aborted turn commits nothing: no assistant node,
  // no usage, and the active branch is unmoved.
  t.deepEqual(await agent.getHistory(), []);
  t.deepEqual(await agent.getUsage(), {
    inputTokens: 0,
    outputTokens: 0,
    turns: 0,
  });
});
