// @ts-nocheck
/* eslint-disable import/order, no-empty-function */

import '@endo/init';
import test from 'ava';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

import {
  makeClaudeClient,
  parseStreamJsonLines,
} from '../src/claude-client.js';

// `E(target)` deep-hardens its target, so anything reachable from an
// object we pass through `E()` (the slice, a ProcessHandle, the mount
// handle) becomes frozen. Recorders therefore live in module-level
// WeakMaps / closures that harden never traverses, rather than as
// properties on those objects.
const procOut = new WeakMap(); // proc -> stdout byte chunks
const procKilled = new WeakMap(); // proc -> boolean

const enc = new TextEncoder();

/**
 * Build an AsyncIterable<Uint8Array> from a list of byte chunks.
 * @param chunks
 */
const bytesIterable = chunks =>
  harden({
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks || []) {
        yield chunk;
      }
    },
  });

/**
 * Fake sandbox slice. `outputs[i]` is the list of stdout byte chunks
 * the i-th spawned process emits. The returned wrapper exposes
 * recorders that are *not* reachable from the slice/proc objects.
 * @param outputs
 */
const makeFakeSlice = (outputs = []) => {
  const spawned = [];
  let i = 0;
  let disposed = false;
  const slice = {
    async spawn(argv, opts) {
      const out = outputs[i] || [];
      i += 1;
      const proc = {
        argv: [...argv],
        opts,
        async stdout() {
          return harden({ kind: 'fake-stdout' });
        },
        async kill() {
          procKilled.set(proc, true);
        },
        async wait() {
          return harden({ code: 0, signal: null });
        },
      };
      procOut.set(proc, out);
      spawned.push(proc);
      return proc;
    },
    async dispose() {
      disposed = true;
    },
  };
  return { slice, spawned, isDisposed: () => disposed };
};

const makeFakeMount = () => {
  let unmounted = false;
  return {
    handle: {
      async unmount() {
        unmounted = true;
      },
    },
    isUnmounted: () => unmounted,
  };
};

// Inject a stdout adapter that reads the fake proc's chunks directly,
// bypassing the @endo/exo-stream base64 wire protocol.
const makeStdoutIterable = proc => bytesIterable(procOut.get(proc));

const baseArgs = (fake, mount, extra = {}) => ({
  sessionId: 'sess-0001',
  createdAt: '2026-01-01T00:00:00.000Z',
  slice: fake.slice,
  mountHandle: mount.handle,
  workspaceMountPoint: '/tmp/claude-sandbox-sess-0001',
  workspacePath: '/workspace',
  backend: 'podman',
  rootfsLabel: 'oci:example/claude:latest',
  makeStdoutIterable,
  ...extra,
});

const drain = async reader => {
  const events = [];
  for await (const value of iterateReader(reader)) {
    events.push(value);
  }
  return events;
};

test('parseStreamJsonLines parses newline-delimited JSON across chunk boundaries', async t => {
  const chunks = [
    enc.encode('{"type":"system"}\n{"type":"assi'),
    enc.encode('stant","text":"hi"}\n'),
    enc.encode('{"type":"result"}\n'),
  ];
  const events = [];
  for await (const e of parseStreamJsonLines(bytesIterable(chunks))) {
    events.push(e);
  }
  t.deepEqual(events, [
    { type: 'system' },
    { type: 'assistant', text: 'hi' },
    { type: 'result' },
  ]);
});

test('parseStreamJsonLines yields a trailing line with no newline', async t => {
  const events = [];
  for await (const e of parseStreamJsonLines(
    bytesIterable([enc.encode('{"type":"result"}')]),
  )) {
    events.push(e);
  }
  t.deepEqual(events, [{ type: 'result' }]);
});

test('parseStreamJsonLines throws on a malformed line', async t => {
  await t.throwsAsync(
    async () => {
      // eslint-disable-next-line no-unused-vars
      for await (const _ of parseStreamJsonLines(
        bytesIterable([enc.encode('not json\n')]),
      )) {
        // drain
      }
    },
    { message: /malformed stream-json line/ },
  );
});

test('send() spawns claude -p with stream-json and yields parsed events', async t => {
  const fake = makeFakeSlice([
    [enc.encode('{"type":"system"}\n{"type":"result"}\n')],
  ]);
  const client = makeClaudeClient(baseArgs(fake, makeFakeMount()));

  const reader = await client.send('do a thing');
  const events = await drain(reader);

  // The reader yields the parsed stream-json events, then a terminal
  // `{ type: 'end' }`.
  t.deepEqual(events, [
    { type: 'system' },
    { type: 'result' },
    { type: 'end' },
  ]);
  t.is(fake.spawned.length, 1);
  const { argv, opts } = fake.spawned[0];
  t.is(argv[0], 'claude');
  t.is(argv[1], '-p');
  t.is(argv[2], 'do a thing');
  t.true(argv.includes('--output-format'));
  t.true(argv.includes('stream-json'));
  t.is(opts.cwd, '/workspace');
  // First send has no conversation to resume.
  t.false(argv.includes('--continue'));
});

test('send() adds --continue after the first turn and forwards --model', async t => {
  const fake = makeFakeSlice([[], []]);
  const client = makeClaudeClient(
    baseArgs(fake, makeFakeMount(), { model: 'claude-sonnet-4-6' }),
  );

  await drain(await client.send('first'));
  await drain(await client.send('second'));

  t.is(fake.spawned.length, 2);
  t.false(fake.spawned[0].argv.includes('--continue'));
  t.true(fake.spawned[1].argv.includes('--continue'));
  for (const proc of fake.spawned) {
    t.true(proc.argv.includes('--model'));
    t.true(proc.argv.includes('claude-sonnet-4-6'));
  }
});

test('overlapping sends queue and run in order (serialized)', async t => {
  const fake = makeFakeSlice([[], []]);
  const client = makeClaudeClient(baseArgs(fake, makeFakeMount()));

  // Fire both sends before draining the first; they must serialize, not race.
  const r1 = await client.send('first');
  const r2 = await client.send('second');
  await drain(r1);
  await drain(r2);

  t.is(fake.spawned.length, 2);
  t.is(fake.spawned[0].argv[2], 'first');
  t.is(fake.spawned[1].argv[2], 'second');
  // The second turn ran strictly after the first, so it resumes with
  // --continue. A concurrent race would not guarantee this.
  t.false(fake.spawned[0].argv.includes('--continue'));
  t.true(fake.spawned[1].argv.includes('--continue'));
});

test('a stream error surfaces as an abort terminal event', async t => {
  const fake = makeFakeSlice([[enc.encode('not json\n')]]);
  const client = makeClaudeClient(baseArgs(fake, makeFakeMount()));

  const events = await drain(await client.send('x'));
  const last = events[events.length - 1];
  t.is(last.type, 'abort');
  t.regex(last.reason, /malformed stream-json line/);
});

test('interrupt() throws when idle and closes-and-kills the in-flight turn', async t => {
  // Before any send there is nothing to interrupt.
  const idle = makeClaudeClient(baseArgs(makeFakeSlice(), makeFakeMount()));
  await t.throwsAsync(() => idle.interrupt(), {
    message: /no in-flight prompt to interrupt/,
  });

  // A turn whose stdout yields one event then blocks, so the turn stays
  // in-flight long enough to interrupt it.
  let unblock;
  const blocked = new Promise(resolve => {
    unblock = resolve;
  });
  const blockingStdout = harden({
    async *[Symbol.asyncIterator]() {
      yield enc.encode('{"type":"system"}\n');
      await blocked;
    },
  });
  const fake = makeFakeSlice();
  const client = makeClaudeClient(
    baseArgs(fake, makeFakeMount(), {
      makeStdoutIterable: () => blockingStdout,
    }),
  );

  const reader = await client.send('work');
  // Pulling the first event proves the turn spawned and is producing.
  const replies = iterateReader(reader);
  const first = await replies.next();
  t.is(first.value.type, 'system');

  await client.interrupt();
  t.true(procKilled.get(fake.spawned[0]));

  unblock(); // let the (now-orphaned) producer task drain and exit
});

test('interrupt() with a queued turn kills the in-flight turn, not the queued one', async t => {
  let unblock;
  const blocked = new Promise(resolve => {
    unblock = resolve;
  });
  const blockingStdout = harden({
    async *[Symbol.asyncIterator]() {
      yield enc.encode('{"type":"system"}\n');
      await blocked;
    },
  });
  const fake = makeFakeSlice();
  const client = makeClaudeClient(
    baseArgs(fake, makeFakeMount(), {
      makeStdoutIterable: () => blockingStdout,
    }),
  );

  const rA = await client.send('A'); // becomes in-flight
  await client.send('B'); // queues behind A (does not spawn yet)
  const first = await iterateReader(rA).next();
  t.is(first.value.type, 'system'); // A is producing
  t.is(fake.spawned.length, 1, 'only the in-flight turn has spawned');

  await client.interrupt();
  // interrupt targeted the in-flight A (killing its process), not the
  // still-queued B — which would previously have been closed instead.
  t.true(procKilled.get(fake.spawned[0]));

  unblock();
});

test('a stream-error abort folds claude stderr into the reason', async t => {
  // stdout emits a malformed line (→ abort); stderr carries the real
  // diagnostic, which must surface in the abort reason.
  const fake = makeFakeSlice([[enc.encode('not json\n')]]);
  const client = makeClaudeClient(
    baseArgs(fake, makeFakeMount(), {
      makeStderrIterable: () =>
        bytesIterable([
          enc.encode('claude: authentication_error: invalid api key\n'),
        ]),
    }),
  );

  const events = await drain(await client.send('x'));
  const last = events[events.length - 1];
  t.is(last.type, 'abort');
  t.regex(last.reason, /malformed stream-json line/);
  t.regex(last.reason, /authentication_error: invalid api key/);
  // The process is killed before stderr is read (so the captured stream EOFs).
  t.true(procKilled.get(fake.spawned[0]));
});

test('terminate() disposes the slice, unmounts, and rejects subsequent send', async t => {
  const fake = makeFakeSlice([[]]);
  const mount = makeFakeMount();
  const client = makeClaudeClient(baseArgs(fake, mount));

  await client.terminate();

  t.true(fake.isDisposed());
  t.true(mount.isUnmounted());
  const status = await client.status();
  t.true(status.terminated);
  await t.throwsAsync(() => client.send('nope'), { message: /is terminated/ });
});

test('a lazy provision thunk runs once on first send and is reused', async t => {
  const fake = makeFakeSlice([[], []]);
  const mount = makeFakeMount();
  let provisionCount = 0;
  const client = makeClaudeClient({
    sessionId: 'sess-lazy',
    createdAt: '2026-01-01T00:00:00.000Z',
    workspaceMountPoint: '/tmp/claude-sandbox-sess-lazy',
    backend: 'podman',
    makeStdoutIterable,
    provision: async () => {
      provisionCount += 1;
      return { slice: fake.slice, mountHandle: mount.handle };
    },
  });

  // Not provisioned until first use.
  t.is(provisionCount, 0);
  await drain(await client.send('one'));
  await drain(await client.send('two'));
  t.is(provisionCount, 1);
  t.is(fake.spawned.length, 2);

  // terminate tears down what the thunk provisioned.
  await client.terminate();
  t.true(fake.isDisposed());
  t.true(mount.isUnmounted());
});

test('terminate() before any lazy provision creates nothing', async t => {
  let provisionCount = 0;
  const client = makeClaudeClient({
    sessionId: 'sess-noop',
    createdAt: '2026-01-01T00:00:00.000Z',
    workspaceMountPoint: '/tmp/claude-sandbox-sess-noop',
    backend: 'podman',
    makeStdoutIterable,
    provision: async () => {
      provisionCount += 1;
      return { slice: makeFakeSlice().slice };
    },
  });
  await client.terminate();
  t.is(provisionCount, 0);
});

test('status() reports session metadata', async t => {
  const fake = makeFakeSlice();
  const client = makeClaudeClient(baseArgs(fake, makeFakeMount()));
  const status = await client.status();
  t.is(status.sessionId, 'sess-0001');
  t.is(status.createdAt, '2026-01-01T00:00:00.000Z');
  t.is(status.backend, 'podman');
  t.is(status.rootfs, 'oci:example/claude:latest');
  t.is(status.workspaceMountPoint, '/tmp/claude-sandbox-sess-0001');
  t.false(status.terminated);
  t.false(status.conversationStarted);
});

test('help() describes the ClaudeClient surface', async t => {
  const client = makeClaudeClient(baseArgs(makeFakeSlice(), makeFakeMount()));
  t.regex(client.help(), /ClaudeClient/);
  t.regex(client.help(), /send\(prompt/);
});

test('initialPrompt is fired and drained at construction', async t => {
  const fake = makeFakeSlice([[enc.encode('{"type":"result"}\n')], []]);
  const client = makeClaudeClient(
    baseArgs(fake, makeFakeMount(), { initialPrompt: 'hello' }),
  );

  // The next explicit send awaits the initial prompt's completion, so
  // by the time it resolves the initial spawn has already happened.
  await drain(await client.send('next'));

  t.is(fake.spawned.length, 2);
  t.is(fake.spawned[0].argv[2], 'hello');
  t.is(fake.spawned[1].argv[2], 'next');
  // The second turn continues the conversation started by the initial
  // prompt.
  t.true(fake.spawned[1].argv.includes('--continue'));
});
