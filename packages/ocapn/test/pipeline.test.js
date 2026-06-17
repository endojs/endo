// @ts-check

import harden from '@endo/harden';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import {
  test,
  waitUntilTrue,
  makeTestClientPair,
  makeTestClient,
  getOcapnDebug,
} from './_util.js';
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

/**
 * Extract the method-name string from an op:deliver-style message.
 * OCapN encodes method names as Symbol-style selectors in `args[0]`
 * (see `makeSelector` in src/selector.js), so we read `description`.
 * Returns undefined for non-deliver messages.
 *
 * @param {object} message
 * @returns {string | undefined}
 */
const getDeliverMethod = message => {
  if (
    message.type !== 'op:deliver' ||
    !Array.isArray(message.args) ||
    message.args.length === 0
  ) {
    return undefined;
  }
  const first = message.args[0];
  if (typeof first === 'symbol') return first.description;
  if (typeof first === 'string') return first;
  return undefined;
};

/**
 * @typedef {object} DeliverSummary
 * @property {string} from
 * @property {string | undefined} method
 */

/**
 * Reduce a transcript to a list of `{ from, method }` for op:deliver
 * entries only — a much clearer picture of what's happening on the wire
 * than the full nested message dump.
 *
 * @param {TranscriptEntry[]} transcript
 * @returns {DeliverSummary[]}
 */
const summarizeDelivers = transcript =>
  transcript
    .filter(e => e.message.type === 'op:deliver')
    .map(e => ({ from: e.from, method: getDeliverMethod(e.message) }));

/**
 * Like `assertMessageTranscript` but specialized to op:deliver and
 * comparing only `{ from, method }`. Failure prints the full transcript
 * so the diff between expected and observed is unambiguous.
 *
 * @param {import('ava').ExecutionContext} t
 * @param {TranscriptEntry[]} transcript - Full recorded transcript
 * @param {DeliverSummary[]} expected
 */
const assertDeliverTranscript = (t, transcript, expected) => {
  const actual = summarizeDelivers(transcript);
  t.deepEqual(
    actual,
    expected,
    `Deliver transcript mismatch.\n\nFull transcript:\n${transcript
      .map(formatEntry)
      .join('\n')}`,
  );
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
      { from: 'B', message: { type: 'op:deliver' } },
      // B sends resolution for add
      { from: 'B', message: { type: 'op:deliver' } },
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
      { from: 'B', message: { type: 'op:deliver' } },
      { from: 'B', message: { type: 'op:deliver' } },
      { from: 'B', message: { type: 'op:deliver' } },
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
      { from: 'B', message: { type: 'op:deliver' } },
      { from: 'B', message: { type: 'op:deliver' } },
      { from: 'B', message: { type: 'op:deliver' } },
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
      { from: 'B', message: { type: 'op:deliver' } },
      { from: 'B', message: { type: 'op:deliver' } },
      { from: 'B', message: { type: 'op:deliver' } },
      { from: 'B', message: { type: 'op:deliver' } },
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
      { from: 'B', message: { type: 'op:deliver' } },
      { from: 'B', message: { type: 'op:deliver' } },
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
      { from: 'B', message: { type: 'op:deliver' } },
      { from: 'B', message: { type: 'op:deliver' } },
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
    const sessionBtoC = await clientKitB.debug.provideInternalSession(
      clientKitC.location,
    );

    // A connects to B
    const sessionAtoB = await clientKitA.debug.provideInternalSession(
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
      { from: 'B', message: { type: 'op:deliver' } },
      { from: 'B', message: { type: 'op:deliver' } },
      { from: 'B', message: { type: 'op:deliver' } },
      { from: 'B', message: { type: 'op:deliver' } },
    ]);

    // Verify B→C transcript: B forwards A's calls to C
    // Note: Messages are interleaved - C responds to fetch before B forwards other calls
    assertMessageTranscript(t, recorderBtoC.transcript, [
      // B enlivens sturdyref by fetching Counter from C
      { from: 'B', message: { type: 'op:deliver' } },
      // C sends resolution for fetch
      { from: 'C', message: { type: 'op:deliver' } },
      // B forwards increment call to C
      { from: 'B', message: { type: 'op:deliver' } },
      // B forwards double call to C
      { from: 'B', message: { type: 'op:deliver' } },
      // B sends deposit-gift for handoff
      { from: 'B', message: { type: 'op:deliver' } },
      // C sends resolutions back to B
      { from: 'C', message: { type: 'op:deliver' } },
      { from: 'C', message: { type: 'op:deliver' } },
      { from: 'C', message: { type: 'op:deliver' } },
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
      { from: 'B', message: { type: 'op:deliver' } },
      // B sends resolution for awaitAndDouble
      { from: 'B', message: { type: 'op:deliver' } },
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

test('pipeline: deliver to local answer fulfilling to remote promise is forwarded (pipelined)', async t => {
  /** @type {(value: unknown) => void} */
  let resolveAlice;
  const alicePending = new Promise(r => {
    resolveAlice = r;
  });
  const inner = Far('FinalResult', {
    getVal: _callId => 4242,
  });

  const testObjectTable = new Map();
  testObjectTable.set(
    'EchoObj',
    Far('echoObj', {
      // Return Alice's import promise synchronously so Bob's local answer tracks it
      echo: x => x,
    }),
  );

  const { establishSession, shutdownBoth } = await makeTestClientPair({
    makeDefaultSwissnumTable: () => testObjectTable,
    clientAOptions: { enableImportCollection: false },
    clientBOptions: { enableImportCollection: false },
  });

  try {
    const { sessionA, sessionB } = await establishSession();
    const recorderBtoA = createMessageRecorder(sessionB.ocapn, 'B', 'A');

    const bootstrapB = sessionA.ocapn.getRemoteBootstrap();
    const promisePass = await E(bootstrapB).fetch(encodeSwissnum('EchoObj'));

    recorderBtoA.transcript.length = 0;

    // Bob's answer promise for echo(...) fulfills to Alice's export promise (remote on Bob)
    const answerFromBob = E(promisePass).echo(alicePending);
    // Pipeline: invoke on the answer before Bob's answer has shortened past that remote promise
    const pipelined = E(answerFromBob).getVal(1234);

    const getOpDelivers = () =>
      recorderBtoA.transcript.filter(e => e.message.type === 'op:deliver');

    // Wait until all expected op:delivers have flowed in both directions.
    await waitUntilTrue(() => getOpDelivers().length >= 4);
    recorderBtoA.unsubscribe();

    assertDeliverTranscript(t, recorderBtoA.transcript, [
      // 1. Alice calls echo(alicePending) on EchoObj.
      { from: 'A', method: 'echo' },
      // 2. Alice pipelines getVal(1234) on Bob's answer to echo.
      { from: 'A', method: 'getVal' },
      // 3. Bob's answer for echo shortens to alicePending (Alice's own
      //    promise, imported on B as a same-peer remote ref). Bob pipelines
      //    the queued getVal(1234) back to Alice on that ref.
      { from: 'B', method: 'getVal' },
      // 4. Bob forwards the resolution of his echo-answer to Alice's
      //    resolveMeDesc: fulfill(alicePending). Alice's resolver fulfills
      //    with one of her own promises — this notifies her that the
      //    answer-slot has shortened to that ref, so any future calls on
      //    her side bypass Bob.
      { from: 'B', method: 'fulfill' },
    ]);

    resolveAlice(inner);

    const result = await pipelined;
    t.is(
      result,
      4242,
      "Pipelined method on Bob's answer (fulfilling to Alice's promise) should reach the eventual object",
    );
  } finally {
    shutdownBoth();
  }
});

test('four-node promise chain emits op:flush on third-party relay hops (experimental)', async t => {
  const flushOptions = {
    enableExperimentalFeatureFlush: true,
    enableExperimentalFeatureDistributedShortening: true,
  };
  const writeLatencyMs = 50;

  const dObjectTable = new Map();
  dObjectTable.set(
    'Depth',
    Far('Depth', {
      makeToken: () =>
        Far('Token', {
          kind: () => 'deep',
        }),
    }),
  );

  const clientKitD = await makeTestClient({
    debugLabel: 'D',
    makeDefaultSwissnumTable: () => dObjectTable,
    clientOptions: flushOptions,
    writeLatencyMs,
  });

  /** @type {any} */
  let clientKitC;
  const cObjectTable = new Map();
  cObjectTable.set(
    'Chain',
    Far('ChainC', {
      extend: async () => {
        const session = await clientKitC.debug.provideInternalSession(
          clientKitD.location,
        );
        const boot = session.ocapn.getRemoteBootstrap();
        const depth = await E(boot).fetch(encodeSwissnum('Depth'));
        return E(depth).makeToken();
      },
    }),
  );

  clientKitC = await makeTestClient({
    debugLabel: 'C',
    makeDefaultSwissnumTable: () => cObjectTable,
    clientOptions: flushOptions,
    writeLatencyMs,
  });

  /** @type {any} */
  let clientKitB;
  const bObjectTable = new Map();
  bObjectTable.set(
    'Chain',
    Far('ChainB', {
      extend: async () => {
        const session = await clientKitB.debug.provideInternalSession(
          clientKitC.location,
        );
        const boot = session.ocapn.getRemoteBootstrap();
        const chain = await E(boot).fetch(encodeSwissnum('Chain'));
        return E(chain).extend();
      },
    }),
  );

  clientKitB = await makeTestClient({
    debugLabel: 'B',
    makeDefaultSwissnumTable: () => bObjectTable,
    clientOptions: flushOptions,
    writeLatencyMs,
  });

  const clientKitA = await makeTestClient({
    debugLabel: 'A',
    clientOptions: flushOptions,
    writeLatencyMs,
  });

  const shutdownAll = () => {
    clientKitA.client.shutdown();
    clientKitB.client.shutdown();
    clientKitC.client.shutdown();
    clientKitD.client.shutdown();
  };

  try {
    await clientKitC.debug.provideInternalSession(clientKitD.location);
    await clientKitB.debug.provideInternalSession(clientKitC.location);
    const sessionAtoB = await clientKitA.debug.provideInternalSession(
      clientKitB.location,
    );

    const sessionCtoB = await clientKitC.debug.provideInternalSession(
      clientKitB.location,
    );
    const sessionBtoA = await clientKitB.debug.provideInternalSession(
      clientKitA.location,
    );

    const recorderCtoB = createMessageRecorder(sessionCtoB.ocapn, 'C', 'B');
    const recorderBtoA = createMessageRecorder(sessionBtoA.ocapn, 'B', 'A');

    const bootstrapB = sessionAtoB.ocapn.getRemoteBootstrap();
    const chainHead = await E(bootstrapB).fetch(encodeSwissnum('Chain'));
    const token = await E(chainHead).extend();
    t.is(await E(token).kind(), 'deep', 'leaf capability works end-to-end');

    recorderCtoB.unsubscribe();
    recorderBtoA.unsubscribe();

    const cFlushSends = recorderCtoB.transcript.filter(
      e => e.from === 'C' && e.message.type === 'op:flush',
    );
    const bFlushSends = recorderBtoA.transcript.filter(
      e => e.from === 'B' && e.message.type === 'op:flush',
    );

    t.is(cFlushSends.length, 1, 'C sends one op:flush when resolving to B');
    t.is(bFlushSends.length, 1, 'B sends one op:flush when resolving to A');

    const cFlush = cFlushSends[0].message;
    const bFlush = bFlushSends[0].message;
    const cFlushPosition = cFlush.position;
    t.true(
      typeof cFlushPosition === 'bigint' && cFlushPosition >= 0n,
      'C op:flush carries non-negative answer/export position',
    );
    const bFlushPosition = bFlush.position;
    t.true(
      typeof bFlushPosition === 'bigint' && bFlushPosition >= 0n,
      'B op:flush carries non-negative answer/export position',
    );
    t.true(
      cFlush.resolveMeDesc !== undefined && bFlush.resolveMeDesc !== undefined,
      'op:flush includes resolveMeDesc for flush-done',
    );
  } finally {
    shutdownAll();
  }
});

test('three-node: shortening to a still-pending remote promise from C (expected to FAIL — shortening to a remote promise)', async t => {
  // Scenario:
  //   - C exposes a `Pending` capability whose `get()` returns a never-settled
  //     local promise that C controls. Because it never resolves, any promise
  //     that "shortens to" it stays pending too.
  //   - B exposes a `Relay` whose `getC()` returns the still-pending C-promise.
  //     B's local answer for `getC()` therefore *shortens* to a C-owned
  //     promise (a remote thenable from B's POV w.r.t. A) but never fulfills.
  //   - A invokes B.getC() and waits to observe the shortening notification.
  //
  // What we expect to see at the protocol level (per the OCapN promise-
  // shortening design): B notifies A that its answer-slot has shortened
  // to a remote (C-owned) promise — via op:flush followed by op:deliver
  // fulfill(thirdPartyRef-to-C-promise). This lets A redirect future
  // pipelined messages on that answer slot to C directly.
  //
  // The current implementation appears not to emit the shortening
  // notification while the underlying remote promise is still pending —
  // the test is expected to fail on that assertion.
  const flushOptions = {
    enableExperimentalFeatureFlush: true,
    enableExperimentalFeatureDistributedShortening: true,
  };

  // A promise that C "owns" and only resolves at the end of the test —
  // we observe the *intermediate* shortening event while it is pending,
  // then resolve so all of the chain's settlers complete cleanly before
  // shutdown (otherwise the connection-close path rejects the pending
  // answer chain with "Session disconnected" and trips ava's
  // unhandled-rejection guard).
  /** @type {(value: unknown) => void} */
  let resolveCSidePending;
  const cSidePending = new Promise(r => {
    resolveCSidePending = r;
  });
  const cObjectTable = new Map();
  cObjectTable.set(
    'Pending',
    Far('Pending', {
      get: () => cSidePending,
    }),
  );

  const clientKitC = await makeTestClient({
    debugLabel: 'C',
    makeDefaultSwissnumTable: () => cObjectTable,
    clientOptions: flushOptions,
  });

  /** @type {any} */
  let clientKitB;
  const bObjectTable = new Map();
  bObjectTable.set(
    'Relay',
    Far('Relay', {
      // First fetch the Pending cap from C (needs the session), *then* return
      // the still-pending promise from `Pending.get()` — without awaiting it.
      // Returning unawaited preserves the C-promise as a *thenable* for the
      // outer answer to shorten onto.
      getC: () => {
        const sessionP = clientKitB.client.provideSession(clientKitC.location);
        const bootstrapP = E(sessionP).getBootstrap();
        const pendingP = E(bootstrapP).fetch(encodeSwissnum('Pending'));
        return E(pendingP).get();
      },
    }),
  );

  clientKitB = await makeTestClient({
    debugLabel: 'B',
    makeDefaultSwissnumTable: () => bObjectTable,
    clientOptions: flushOptions,
  });

  const clientKitA = await makeTestClient({
    debugLabel: 'A',
    clientOptions: flushOptions,
  });

  const shutdownAll = () => {
    clientKitA.client.shutdown();
    clientKitB.client.shutdown();
    clientKitC.client.shutdown();
  };

  try {
    await clientKitB.client.provideSession(clientKitC.location);
    const sessionAtoB = await clientKitA.client.provideSession(
      clientKitB.location,
    );
    // sessionBtoA is needed via the internal API so the recorder can subscribe
    // to wire messages — no public surface exposes that today.
    const sessionBtoA = await clientKitB.debug.provideInternalSession(
      clientKitA.location,
    );

    const bootstrapB = sessionAtoB.getBootstrap();
    const relay = await E(bootstrapB).fetch(encodeSwissnum('Relay'));

    const recorderBtoA = createMessageRecorder(sessionBtoA.ocapn, 'B', 'A');

    // Predicates over a recorded message entry — the protocol signal we
    // expect from B once its answer shortens to a remote (C-owned) promise
    // is *either* an op:flush *or* an op:deliver carrying `fulfill(...)` on
    // A's resolveMeDesc.
    const isFromB = e => e.from === 'B';
    const isFlushMessage = msg => msg.type === 'op:flush';
    const isFulfillDeliver = msg =>
      msg.type === 'op:deliver' &&
      Array.isArray(msg.args) &&
      typeof msg.args[0] === 'symbol' &&
      msg.args[0].description === 'fulfill';
    const isShorteningNotification = e =>
      isFromB(e) && (isFlushMessage(e.message) || isFulfillDeliver(e.message));

    // Kick off the call but don't await — we're observing intermediate
    // protocol state, not waiting for the (never-arriving) settlement.
    const cPromiseViaB = E(relay).getC();
    cPromiseViaB.catch(() => {}); // suppress unhandled-rejection on shutdown

    // Give the shortening machinery time to propagate. If B never emits a
    // shortening notification, waitUntilTrue rejects on timeout — we
    // swallow that here so the assertions below produce a readable failure.
    await waitUntilTrue(
      () => recorderBtoA.transcript.some(isShorteningNotification),
      5000,
    ).catch(() => {});

    recorderBtoA.unsubscribe();

    const bFlushSends = recorderBtoA.transcript.filter(
      e => isFromB(e) && isFlushMessage(e.message),
    );
    const bFulfillSends = recorderBtoA.transcript.filter(
      e => isFromB(e) && isFulfillDeliver(e.message),
    );

    // Both should happen for promise shortening to a remote promise:
    //   1) B sends op:flush so A can safely redirect pipelined messages.
    //   2) B sends a fulfill on the resolveMeDesc carrying a third-party
    //      reference to the C-owned promise.
    t.is(
      bFlushSends.length,
      1,
      'B should send one op:flush to A when shortening to a remote promise',
    );
    t.is(
      bFulfillSends.length,
      1,
      'B should send one fulfill notifying A that its answer shortened to a remote (C) promise',
    );

    // Let the chain settle cleanly so connection-close doesn't reject
    // pending answer-slot settlers (which would trip the unhandled-
    // rejection guard).
    resolveCSidePending(undefined);
    // Wait for the chain to actually complete through all three nodes.
    await cPromiseViaB.catch(() => {});
  } finally {
    shutdownAll();
  }
});
