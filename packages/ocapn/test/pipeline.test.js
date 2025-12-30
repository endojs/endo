// @ts-check

import test from '@endo/ses-ava/test.js';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import { makeTestClientPair, makeTestClient, getOcapnDebug } from './_util.js';
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

  const unsubscribe = getOcapnDebug(ocapn).subscribeMessages(
    (direction, message) => {
      const from = direction === 'send' ? self : peer;
      transcript.push({ from, message });
    },
  );

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
  if (transcript.length !== expected.length) {
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

  // Disable import collection to avoid GC-related flakiness in pipeline tests
  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
    clientAOptions: { enableImportCollection: false },
    clientBOptions: { enableImportCollection: false },
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

  // Disable import collection to avoid GC-related flakiness in pipeline tests
  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
    clientAOptions: { enableImportCollection: false },
    clientBOptions: { enableImportCollection: false },
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

  // Disable import collection to avoid GC-related flakiness in pipeline tests
  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
    clientAOptions: { enableImportCollection: false },
    clientBOptions: { enableImportCollection: false },
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

  // Disable import collection to avoid GC-related flakiness in pipeline tests
  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
    clientAOptions: { enableImportCollection: false },
    clientBOptions: { enableImportCollection: false },
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

  // Disable import collection to avoid GC-related flakiness in pipeline tests
  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
    clientAOptions: { enableImportCollection: false },
    clientBOptions: { enableImportCollection: false },
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

  // Disable import collection to avoid GC-related flakiness in pipeline tests
  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
    clientAOptions: { enableImportCollection: false },
    clientBOptions: { enableImportCollection: false },
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

test('pipeline: three-party handoff shows B forwarding to C on behalf of A', async t => {
  // Setup:
  // - C has an object "Counter" that A wants to use
  // - B has a "Broker" that holds a sturdyref to C's Counter
  // - When A calls getCounter, B enlivens the sturdyref to get the Counter from C
  // - A pipelines calls on the Counter
  // - We verify via transcripts that B forwards A's messages to C
  //
  // We use writeLatencyMs to add artificial latency to outgoing messages.
  // This ensures deterministic message ordering by queuing all pipelined
  // calls before any responses arrive.
  const writeLatencyMs = 50;

  // C's object table - the Counter lives on C
  const cObjectTable = new Map();
  cObjectTable.set(
    'Counter',
    Far('counter', {
      increment: n => n + 1,
      double: n => n * 2,
    }),
  );

  // Create three clients with artificial write latency for deterministic ordering
  const clientKitA = await makeTestClient({ debugLabel: 'A', writeLatencyMs });
  const clientKitC = await makeTestClient({
    debugLabel: 'C',
    makeDefaultSwissnumTable: () => cObjectTable,
    writeLatencyMs,
  });

  /** @type {any} */
  let clientKitB;

  // B's object table - the Broker enlivens a sturdyref to get the counter from C
  const bObjectTable = new Map();
  bObjectTable.set(
    'Broker',
    Far('broker', {
      getCounter: () => {
        // B enlivens the sturdyref to C's Counter
        const sturdyRef = clientKitB.client.makeSturdyRef(
          clientKitC.location,
          encodeSwissnum('Counter'),
        );
        return clientKitB.client.enlivenSturdyRef(sturdyRef);
      },
    }),
  );

  clientKitB = await makeTestClient({
    debugLabel: 'B',
    makeDefaultSwissnumTable: () => bObjectTable,
    writeLatencyMs,
  });

  const shutdownAll = () => {
    clientKitA.client.shutdown();
    clientKitB.client.shutdown();
    clientKitC.client.shutdown();
  };

  try {
    // B eagerly establishes session to C so we can record the B→C transcript
    // The sturdyref enlivening will reuse this existing session
    const sessionBtoC = await clientKitB.client.provideSession(
      clientKitC.location,
    );

    // A connects to B
    const sessionAtoB = await clientKitA.client.provideSession(
      clientKitB.location,
    );

    // Start recording on A→B session
    const recorderAtoB = createMessageRecorder(sessionAtoB.ocapn, 'A', 'B');

    // Start recording on B→C session
    const recorderBtoC = createMessageRecorder(sessionBtoC.ocapn, 'B', 'C');

    const bootstrapBfromA = sessionAtoB.ocapn.getRemoteBootstrap();

    // A fetches the Broker from B
    const broker = E(bootstrapBfromA).fetch(encodeSwissnum('Broker'));

    // A calls getCounter (pipelined) - this causes B to enliven the sturdyref to C
    const counter = E(broker).getCounter();

    // A pipelines calls on the counter (which is from C)
    const result1 = E(counter).increment(5);
    const result2 = E(counter).double(10);

    // Wait for results
    const [r1, r2] = await Promise.all([result1, result2]);
    t.is(r1, 6, 'increment(5) should return 6');
    t.is(r2, 20, 'double(10) should return 20');

    recorderAtoB.unsubscribe();
    recorderBtoC.unsubscribe();

    // Verify A→B transcript: A sends all pipelined calls to B
    assertMessageTranscript(t, recorderAtoB.transcript, [
      // A fetches Broker from B
      { from: 'A', message: { type: 'op:deliver' } },
      // A calls getCounter on Broker (pipelined)
      { from: 'A', message: { type: 'op:deliver' } },
      // A calls increment on counter (pipelined through handoff)
      { from: 'A', message: { type: 'op:deliver' } },
      // A calls double on counter (pipelined through handoff)
      { from: 'A', message: { type: 'op:deliver' } },
      // B sends resolutions back to A
      { from: 'B', message: { type: 'op:deliver-only' } },
      { from: 'B', message: { type: 'op:deliver-only' } },
      { from: 'B', message: { type: 'op:deliver-only' } },
      { from: 'B', message: { type: 'op:deliver-only' } },
    ]);

    // Verify B→C transcript: B forwards A's calls to C
    // Note: Messages are interleaved - C responds to fetch before B forwards other calls
    assertMessageTranscript(t, recorderBtoC.transcript, [
      // B enlivens sturdyref by fetching Counter from C
      { from: 'B', message: { type: 'op:deliver' } },
      // C sends resolution for fetch
      { from: 'C', message: { type: 'op:deliver-only' } },
      // B forwards increment call to C
      { from: 'B', message: { type: 'op:deliver' } },
      // B forwards double call to C
      { from: 'B', message: { type: 'op:deliver' } },
      // B sends deposit-gift for handoff
      { from: 'B', message: { type: 'op:deliver' } },
      // C sends resolutions back to B
      { from: 'C', message: { type: 'op:deliver-only' } },
      { from: 'C', message: { type: 'op:deliver-only' } },
      { from: 'C', message: { type: 'op:deliver-only' } },
    ]);
  } finally {
    shutdownAll();
  }
});

test('pipeline: remote answer promise sent as argument is local to receiver (no op:listen)', async t => {
  // This test verifies that when Alice sends a remote answer promise (from a call to Bob)
  // back to Bob as an argument, Bob does NOT send op:listen for it because:
  // - From Bob's perspective, that promise is a LOCAL answer (a+N), not a remote one
  // - Bob already has the settler for it, so no subscription is needed

  const testObjectTable = new Map();
  testObjectTable.set(
    'SlowService',
    Far('slowService', {
      // Returns a promise that resolves after a tick
      getDelayedValue: async () => {
        await Promise.resolve(); // Simulate async work
        return 42;
      },
    }),
  );
  testObjectTable.set(
    'Awaiter',
    Far('awaiter', {
      // Awaits the given promise and returns its value doubled
      awaitAndDouble: async promise => {
        const value = await promise;
        return value * 2;
      },
    }),
  );

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
    clientAOptions: { enableImportCollection: false },
    clientBOptions: { enableImportCollection: false },
  });

  try {
    const {
      sessionA: { ocapn: ocapnA },
    } = await establishSession();

    const recorder = createMessageRecorder(ocapnA, 'A', 'B');
    const bootstrapB = ocapnA.getRemoteBootstrap();

    // Step 1: Alice fetches SlowService and Awaiter from Bob
    const slowService = await E(bootstrapB).fetch(
      encodeSwissnum('SlowService'),
    );
    const awaiter = await E(bootstrapB).fetch(encodeSwissnum('Awaiter'));

    // Clear the transcript to focus on the interesting part
    recorder.transcript.length = 0;

    // Step 2: Alice calls getDelayedValue on SlowService (creates remote answer promise)
    const delayedValuePromise = E(slowService).getDelayedValue();

    // Step 3: Alice immediately passes that remote answer promise to Awaiter
    // From Alice's perspective: delayedValuePromise is a remote answer (a-N)
    // From Bob's perspective: when he receives it, it's a local answer (a+N)
    const result = await E(awaiter).awaitAndDouble(delayedValuePromise);

    t.is(result, 84, 'Awaiter should return 42 * 2 = 84');
    recorder.unsubscribe();

    // Verify the transcript
    // Key assertion: Bob should NOT send op:listen for the answer promise
    // because it's local to him (a+N from his perspective)
    assertMessageTranscript(t, recorder.transcript, [
      // A calls getDelayedValue on SlowService
      { from: 'A', message: { type: 'op:deliver' } },
      // A calls awaitAndDouble on Awaiter with the answer promise
      { from: 'A', message: { type: 'op:deliver' } },
      // B sends resolution for getDelayedValue
      { from: 'B', message: { type: 'op:deliver-only' } },
      // B sends resolution for awaitAndDouble
      { from: 'B', message: { type: 'op:deliver-only' } },
    ]);

    // Additional assertion: verify NO op:listen messages in the transcript
    const opListenMessages = recorder.transcript.filter(
      entry => entry.message.type === 'op:listen',
    );
    t.is(
      opListenMessages.length,
      0,
      'No one (especially not Bob) should send op:listen',
    );
  } finally {
    shutdownBoth();
  }
});
