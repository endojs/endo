// @ts-check

import test from '@endo/ses-ava/test.js';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import { makeTestClientPair } from './_util.js';
import { encodeSwissnum } from '../src/client/util.js';

/**
 * @typedef {object} TranscriptEntry
 * @property {string} from - Sender's debugLabel
 * @property {object} message
 */

/**
 * @typedef {object} ExpectedEntry
 * @property {string} from - Sender's debugLabel (e.g., 'A' or 'B')
 * @property {object} message - Partial message to match against
 */

/**
 * Creates a message recorder that subscribes to messages on an ocapn instance.
 * Records all messages in order with the sender's debugLabel.
 * @param {import('../src/client/ocapn.js').Ocapn} ocapn
 * @param {string} self - debugLabel for this client (e.g., 'A')
 * @param {string} peer - debugLabel for the peer client (e.g., 'B')
 * @returns {{ transcript: TranscriptEntry[], unsubscribe: () => void }}
 */
const createMessageRecorder = (ocapn, self, peer) => {
  /** @type {TranscriptEntry[]} */
  const transcript = [];

  const unsubscribe = ocapn.debug.subscribeMessages((direction, message) => {
    const from = direction === 'send' ? self : peer;
    transcript.push({ from, message });
  });

  return { transcript, unsubscribe };
};

/**
 * Checks if `actual` contains all properties from `expected` (deep partial match).
 * @param {unknown} actual
 * @param {unknown} expected
 * @returns {boolean}
 */
const deepPartialMatch = (actual, expected) => {
  if (expected === undefined) {
    return true;
  }
  if (expected === null || typeof expected !== 'object') {
    return Object.is(actual, expected);
  }
  if (actual === null || typeof actual !== 'object') {
    return false;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    if (expected.length !== actual.length) return false;
    return expected.every((item, i) => deepPartialMatch(actual[i], item));
  }
  for (const key of Object.keys(expected)) {
    if (!deepPartialMatch(actual[key], expected[key])) {
      return false;
    }
  }
  return true;
};

/**
 * Formats a transcript entry for display.
 * @param {TranscriptEntry} entry
 * @returns {string}
 */
const formatEntry = entry => {
  const msgStr = JSON.stringify(
    entry.message,
    (key, value) => {
      if (typeof value === 'bigint') return `${value}n`;
      if (typeof value === 'function') return '[Function]';
      if (value instanceof Promise) return '[Promise]';
      if (typeof value === 'symbol') return value.toString();
      return value;
    },
    2,
  );
  return `${entry.from}: ${msgStr}`;
};

/**
 * Asserts that the recorded transcript matches the expected entries.
 * Each expected entry specifies the sender and partial message properties to match.
 *
 * @param {import('ava').ExecutionContext} t - AVA test context
 * @param {TranscriptEntry[]} transcript - Recorded transcript
 * @param {ExpectedEntry[]} expected - Expected entries with partial matching
 */
const assertMessageTranscript = (t, transcript, expected) => {
  if (transcript.length < expected.length) {
    t.fail(
      `Transcript too short: expected ${expected.length} entries, got ${transcript.length}\n\n` +
        `Actual transcript:\n${transcript.map(formatEntry).join('\n')}`,
    );
    return;
  }

  for (let i = 0; i < expected.length; i += 1) {
    const exp = expected[i];
    const act = transcript[i];

    if (act.from !== exp.from) {
      t.fail(
        `Entry ${i}: sender mismatch\n` +
          `  Expected: ${exp.from}\n` +
          `  Actual:   ${act.from}\n\n` +
          `Full transcript:\n${transcript.map(formatEntry).join('\n')}`,
      );
      return;
    }

    if (!deepPartialMatch(act.message, exp.message)) {
      t.fail(
        `Entry ${i}: message mismatch\n` +
          `  Expected properties: ${JSON.stringify(exp.message, null, 2)}\n` +
          `  Actual message: ${formatEntry(act)}\n\n` +
          `Full transcript:\n${transcript.map(formatEntry).join('\n')}`,
      );
      return;
    }
  }

  t.pass(`Transcript matches ${expected.length} expected entries`);
};

test('pipeline: method invocation transcript', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Calculator',
    Far('calculator', {
      add: (a, b) => a + b,
    }),
  );

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  try {
    const {
      sessionA: { ocapn: ocapnA },
    } = await establishSession();

    const recorder = createMessageRecorder(ocapnA, 'A', 'B');
    const bootstrapB = ocapnA.getRemoteBootstrap();

    // Pipelined call: fetch and immediately invoke
    const calculator = E(bootstrapB).fetch(encodeSwissnum('Calculator'));
    const result = await E(calculator).add(2, 3);

    t.is(result, 5, 'Calculator should return correct result');
    recorder.unsubscribe();

    assertMessageTranscript(t, recorder.transcript, [
      // A sends fetch call to B's bootstrap
      { from: 'A', message: { type: 'op:deliver' } },
      // A sends add call (pipelined, before fetch returns)
      { from: 'A', message: { type: 'op:deliver' } },
      // B sends resolution for fetch
      { from: 'B', message: { type: 'op:deliver-only' } },
      // B sends resolution for add
      { from: 'B', message: { type: 'op:deliver-only' } },
    ]);
  } finally {
    shutdownBoth();
  }
});

test('pipeline: op:get field access transcript', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Record Provider',
    Far('recordProvider', () => {
      return harden({ foo: 'bar', count: 42 });
    }),
  );

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  try {
    const {
      sessionA: { ocapn: ocapnA },
    } = await establishSession();

    const recorder = createMessageRecorder(ocapnA, 'A', 'B');
    const bootstrapB = ocapnA.getRemoteBootstrap();

    // Pipelined: fetch provider, call it, then get field
    const recordProvider = E(bootstrapB).fetch(
      encodeSwissnum('Record Provider'),
    );
    const recordPromise = E(recordProvider)();
    const fooValue = await E.get(recordPromise).foo;

    t.is(fooValue, 'bar', 'Should get correct field value');
    recorder.unsubscribe();

    assertMessageTranscript(t, recorder.transcript, [
      // A fetches the record provider
      { from: 'A', message: { type: 'op:deliver' } },
      // A calls the provider (pipelined)
      { from: 'A', message: { type: 'op:deliver' } },
      // A gets field 'foo' from the result (pipelined)
      { from: 'A', message: { type: 'op:get', fieldName: 'foo' } },
      // A listens for the get result
      { from: 'A', message: { type: 'op:listen', wantsPartial: false } },
      // B sends resolutions
      { from: 'B', message: { type: 'op:deliver-only' } },
      { from: 'B', message: { type: 'op:deliver-only' } },
      { from: 'B', message: { type: 'op:deliver-only' } },
    ]);
  } finally {
    shutdownBoth();
  }
});

test('pipeline: op:index array access transcript', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Array Provider',
    Far('arrayProvider', () => {
      return harden(['first', 'second', 'third']);
    }),
  );

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  try {
    const {
      sessionA: { ocapn: ocapnA },
    } = await establishSession();

    const recorder = createMessageRecorder(ocapnA, 'A', 'B');
    const bootstrapB = ocapnA.getRemoteBootstrap();

    // Pipelined: fetch provider, call it, then index
    const arrayProvider = E(bootstrapB).fetch(encodeSwissnum('Array Provider'));
    const arrayPromise = E(arrayProvider)();
    const firstValue = await E.get(arrayPromise)[0];

    t.is(firstValue, 'first', 'Should get correct array element');
    recorder.unsubscribe();

    assertMessageTranscript(t, recorder.transcript, [
      // A fetches the array provider
      { from: 'A', message: { type: 'op:deliver' } },
      // A calls the provider (pipelined)
      { from: 'A', message: { type: 'op:deliver' } },
      // A indexes into the result (pipelined)
      { from: 'A', message: { type: 'op:index', index: 0n } },
      // A listens for the index result
      { from: 'A', message: { type: 'op:listen', wantsPartial: false } },
      // B sends resolutions
      { from: 'B', message: { type: 'op:deliver-only' } },
      { from: 'B', message: { type: 'op:deliver-only' } },
      { from: 'B', message: { type: 'op:deliver-only' } },
    ]);
  } finally {
    shutdownBoth();
  }
});

test('pipeline: complex nested access transcript', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Data Provider',
    Far('dataProvider', {
      getRecord: () => harden({ items: ['a', 'b', 'c'], meta: { count: 3 } }),
    }),
  );

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  try {
    const {
      sessionA: { ocapn: ocapnA },
    } = await establishSession();

    const recorder = createMessageRecorder(ocapnA, 'A', 'B');
    const bootstrapB = ocapnA.getRemoteBootstrap();

    // Complex pipeline: fetch -> call method -> get field -> index
    const dataProvider = E(bootstrapB).fetch(encodeSwissnum('Data Provider'));
    const recordPromise = E(dataProvider).getRecord();
    const itemsPromise = E.get(recordPromise).items;
    const secondItem = await E.get(itemsPromise)[1];

    t.is(secondItem, 'b', 'Should get correct nested value');
    recorder.unsubscribe();

    assertMessageTranscript(t, recorder.transcript, [
      // A fetches data provider
      { from: 'A', message: { type: 'op:deliver' } },
      // A calls getRecord (pipelined)
      { from: 'A', message: { type: 'op:deliver' } },
      // A gets 'items' field (pipelined)
      { from: 'A', message: { type: 'op:get', fieldName: 'items' } },
      // A listens for items
      { from: 'A', message: { type: 'op:listen' } },
      // A indexes into items[1] (pipelined)
      { from: 'A', message: { type: 'op:index', index: 1n } },
      // A listens for index result
      { from: 'A', message: { type: 'op:listen' } },
      // B sends resolutions
      { from: 'B', message: { type: 'op:deliver-only' } },
      { from: 'B', message: { type: 'op:deliver-only' } },
      { from: 'B', message: { type: 'op:deliver-only' } },
      { from: 'B', message: { type: 'op:deliver-only' } },
    ]);
  } finally {
    shutdownBoth();
  }
});

test('pipeline: all sends before receives proves pipelining', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Echo',
    Far('echo', value => value),
  );

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  try {
    const {
      sessionA: { ocapn: ocapnA },
    } = await establishSession();

    const recorder = createMessageRecorder(ocapnA, 'A', 'B');
    const bootstrapB = ocapnA.getRemoteBootstrap();

    // Simple pipeline: fetch and call
    const echo = E(bootstrapB).fetch(encodeSwissnum('Echo'));
    const result = await E(echo)({ nested: { value: 123 } });

    t.deepEqual(result, { nested: { value: 123 } }, 'Echo should return input');
    recorder.unsubscribe();

    // Key assertion: ALL messages from A happen before ANY messages from B
    // This proves pipelining - we send the second call before the first returns
    const firstBMessageIndex = recorder.transcript.findIndex(
      e => e.from === 'B',
    );
    const aMessageIndices = recorder.transcript
      .map((e, i) => (e.from === 'A' ? i : -1))
      .filter(i => i >= 0);
    const lastAMessageIndex = aMessageIndices[aMessageIndices.length - 1];

    t.true(
      lastAMessageIndex !== undefined && lastAMessageIndex < firstBMessageIndex,
      `All A messages (last at index ${lastAMessageIndex}) should come before first B message (at index ${firstBMessageIndex})`,
    );

    // Verify the structure
    assertMessageTranscript(t, recorder.transcript, [
      { from: 'A', message: { type: 'op:deliver' } },
      { from: 'A', message: { type: 'op:deliver' } },
      { from: 'B', message: { type: 'op:deliver-only' } },
      { from: 'B', message: { type: 'op:deliver-only' } },
    ]);
  } finally {
    shutdownBoth();
  }
});

test('pipeline: verify args in deliver messages', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Calculator',
    Far('calculator', {
      multiply: (a, b) => a * b,
    }),
  );

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  try {
    const {
      sessionA: { ocapn: ocapnA },
    } = await establishSession();

    const recorder = createMessageRecorder(ocapnA, 'A', 'B');
    const bootstrapB = ocapnA.getRemoteBootstrap();

    const calculator = E(bootstrapB).fetch(encodeSwissnum('Calculator'));
    const result = await E(calculator).multiply(7, 6);

    t.is(result, 42, 'Calculator should return correct result');
    recorder.unsubscribe();

    // Find the multiply call and verify its args
    const multiplyCall = recorder.transcript.find(
      e =>
        e.from === 'A' &&
        e.message.type === 'op:deliver' &&
        e.message.args?.length === 3 &&
        e.message.args[1] === 7 &&
        e.message.args[2] === 6,
    );

    t.truthy(
      multiplyCall,
      'Should find multiply call with args [selector, 7, 6]',
    );

    // Verify the full transcript structure
    assertMessageTranscript(t, recorder.transcript, [
      { from: 'A', message: { type: 'op:deliver' } },
      { from: 'A', message: { type: 'op:deliver' } },
      { from: 'B', message: { type: 'op:deliver-only' } },
      { from: 'B', message: { type: 'op:deliver-only' } },
    ]);
  } finally {
    shutdownBoth();
  }
});
