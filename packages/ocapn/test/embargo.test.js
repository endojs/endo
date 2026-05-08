// @ts-check

import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import { test, makeTestClient, getOcapnDebug } from './_util.js';
import { encodeSwissnum } from '../src/client/util.js';

/**
 * @typedef {object} TranscriptEntry
 * @property {string} from
 * @property {object} message
 */

/**
 * @param {import('../src/client/ocapn.js').Ocapn} ocapn
 * @param {string} self
 * @param {string} peer
 */
const createMessageRecorder = (ocapn, self, peer) => {
  /** @type {TranscriptEntry[]} */
  const transcript = [];
  const unsubscribe = getOcapnDebug(ocapn).subscribeMessages(
    (direction, message) => {
      transcript.push({
        from: direction === 'send' ? self : peer,
        message,
      });
    },
  );
  return { transcript, unsubscribe };
};

test('embargo: per-reference FIFO is preserved across promise shortening', async t => {
  // Scenario: A creates a counter and stashes it on B. A then asks B to hand it
  // back via a pipelined call, and *also* pipelines further increments on the
  // returned promise before awaiting it. Once the returned promise resolves
  // back to A's local counter, A makes a direct call too.
  //
  // Without an embargo, the direct call would be processed locally as a
  // microtask and overtake the still-in-flight pipelined calls (which travel
  // A -> B -> A via promise pipelining). The capnproto-style sender/receiver
  // loopback disembargo holds the resolution until the round-trip completes,
  // by which point all already-pipelined messages have been forwarded back
  // and applied to the counter in order.
  //
  // The artificial write latency makes the ordering deterministic: every
  // network hop costs at least `writeLatencyMs` ms, so direct local calls
  // (microtask latency) would clearly win the race in the absence of the
  // embargo.
  const writeLatencyMs = 50;

  /** @type {string[]} */
  const events = [];
  const counter = Far('counter', {
    increment: label => {
      events.push(label);
      return events.length;
    },
  });

  /** @type {unknown} */
  let stashed;
  const broker = Far('broker', {
    stash: x => {
      stashed = x;
      return 'ok';
    },
    getStashed: () => stashed,
  });

  const aObjectTable = new Map();
  aObjectTable.set('counter', counter);

  const bObjectTable = new Map();
  bObjectTable.set('broker', broker);

  const clientKitA = await makeTestClient({
    debugLabel: 'A',
    makeDefaultSwissnumTable: () => aObjectTable,
    writeLatencyMs,
  });
  const clientKitB = await makeTestClient({
    debugLabel: 'B',
    makeDefaultSwissnumTable: () => bObjectTable,
    writeLatencyMs,
  });

  try {
    const sessionAtoB = await clientKitA.debug.provideInternalSession(
      clientKitB.location,
    );
    const bootstrapBfromA = sessionAtoB.ocapn.getRemoteBootstrap();

    // Acquire the broker, then deposit the local counter on it.
    const remoteBroker = await E(bootstrapBfromA).fetch(
      encodeSwissnum('broker'),
    );
    await E(remoteBroker).stash(counter);

    // Begin recording once setup completes so we can inspect just the
    // disembargo round trip.
    const recorder = createMessageRecorder(sessionAtoB.ocapn, 'A', 'B');

    const pendingPromise = E(remoteBroker).getStashed();
    const r1 = E(pendingPromise).increment('pipe1');
    const r2 = E(pendingPromise).increment('pipe2');

    // The promise resolves to the local counter; with the embargo, this
    // await is delayed until the receiver-loopback echo arrives, by which
    // point both pipelined calls have been forwarded back and applied.
    const resolved = await pendingPromise;
    t.is(resolved, counter, 'pipelined promise resolves to the local counter');

    const r3 = E(resolved).increment('direct');

    const [v1, v2, v3] = await Promise.all([r1, r2, r3]);

    recorder.unsubscribe();

    t.deepEqual(
      events,
      ['pipe1', 'pipe2', 'direct'],
      'pipelined calls must precede the direct call after promise shortening',
    );
    t.deepEqual(
      [v1, v2, v3],
      [1, 2, 3],
      'increment results reflect the FIFO call order',
    );

    const isDisembargoMatching = (entry, fromLabel, contextType) => {
      const message = /** @type {any} */ (entry.message);
      return (
        entry.from === fromLabel &&
        message.type === 'op:disembargo' &&
        message.context !== undefined &&
        message.context.type === contextType
      );
    };
    const senderLoopbacks = recorder.transcript.filter(e =>
      isDisembargoMatching(e, 'A', 'sender-loopback'),
    );
    const receiverLoopbacks = recorder.transcript.filter(e =>
      isDisembargoMatching(e, 'B', 'receiver-loopback'),
    );

    t.is(
      senderLoopbacks.length,
      1,
      'A sends exactly one sender-loopback disembargo',
    );
    t.is(
      receiverLoopbacks.length,
      1,
      'B echoes back exactly one receiver-loopback disembargo',
    );
    t.is(
      /** @type {any} */ (senderLoopbacks[0].message).context.embargoId,
      /** @type {any} */ (receiverLoopbacks[0].message).context.embargoId,
      'sender-loopback and receiver-loopback share the embargoId',
    );
  } finally {
    clientKitA.client.shutdown();
    clientKitB.client.shutdown();
  }
});

test('embargo: three-party handoff preserves end-to-end FIFO under shortening', async t => {
  // Three vats:
  //   - C hosts the counter
  //   - B holds a sturdyref to the counter and exposes it via a broker
  //   - A acquires the counter through B (a third-party handoff: B is the
  //     gifter, C is the exporter, A is the receiver).
  //
  // A pipelines two `increment` calls on the broker promise (which travel
  // A→B and are forwarded by B to the counter on C as B→C deliveries) and,
  // once the promise has resolved through the handoff, makes a direct call.
  // Without the level-3 disembargo, the direct A→C call could overtake the
  // still-in-flight B→C forwarded calls. With it, A's `accept` disembargo
  // is forwarded by B as a `provide` disembargo on the same B→C wire as the
  // forwarded calls, which holds the exporter's `withdraw-gift` response
  // back until those forwarded calls have been applied.
  const writeLatencyMs = 50;

  /** @type {string[]} */
  const events = [];
  const counter = Far('counter', {
    increment: label => {
      events.push(label);
      return events.length;
    },
  });

  const cObjectTable = new Map();
  cObjectTable.set('counter', counter);

  /** @type {any} */
  let clientKitB;
  const broker = Far('broker', {
    getCounter: () => {
      const sturdyRef = clientKitB.client.makeSturdyRef(
        // eslint-disable-next-line no-use-before-define
        clientKitC.location,
        encodeSwissnum('counter'),
      );
      return clientKitB.client.enlivenSturdyRef(sturdyRef);
    },
  });

  const bObjectTable = new Map();
  bObjectTable.set('broker', broker);

  const clientKitA = await makeTestClient({ debugLabel: 'A', writeLatencyMs });
  const clientKitC = await makeTestClient({
    debugLabel: 'C',
    makeDefaultSwissnumTable: () => cObjectTable,
    writeLatencyMs,
  });
  clientKitB = await makeTestClient({
    debugLabel: 'B',
    makeDefaultSwissnumTable: () => bObjectTable,
    writeLatencyMs,
  });

  try {
    // Establish B→C eagerly so the sturdyref enlivening reuses it.
    await clientKitB.debug.provideInternalSession(clientKitC.location);
    const sessionAtoB = await clientKitA.debug.provideInternalSession(
      clientKitB.location,
    );

    const recorderAtoB = createMessageRecorder(sessionAtoB.ocapn, 'A', 'B');

    const bootstrapBfromA = sessionAtoB.ocapn.getRemoteBootstrap();
    const remoteBroker = await E(bootstrapBfromA).fetch(
      encodeSwissnum('broker'),
    );

    const counterPromise = E(remoteBroker).getCounter();
    const r1 = E(counterPromise).increment('pipe1');
    const r2 = E(counterPromise).increment('pipe2');

    // The promise resolves to the counter at C via the handoff. With the
    // level-3 embargo, this await is delayed until the disembargo round
    // trip lands at C (A→B accept; B→C provide), which is also after the
    // forwarded pipe1/pipe2 deliveries land on the same B→C wire.
    const resolved = await counterPromise;

    const r3 = E(resolved).increment('direct');

    const [v1, v2, v3] = await Promise.all([r1, r2, r3]);

    recorderAtoB.unsubscribe();

    t.deepEqual(
      events,
      ['pipe1', 'pipe2', 'direct'],
      'pipelined calls forwarded through the gifter must precede the direct call after the handoff resolves',
    );
    t.deepEqual(
      [v1, v2, v3],
      [1, 2, 3],
      'increment results reflect the FIFO call order at the exporter',
    );

    const acceptDisembargos = recorderAtoB.transcript.filter(entry => {
      const message = /** @type {any} */ (entry.message);
      return (
        entry.from === 'A' &&
        message.type === 'op:disembargo' &&
        message.context !== undefined &&
        message.context.type === 'accept'
      );
    });
    t.is(
      acceptDisembargos.length,
      1,
      'A sends exactly one `accept` disembargo to the gifter',
    );
  } finally {
    clientKitA.client.shutdown();
    clientKitB.client.shutdown();
    clientKitC.client.shutdown();
  }
});

test('embargo: resolution to a remote-only value does not trigger a disembargo', async t => {
  // When the resolved value is hosted by the peer (or any non-local party),
  // no shortening happens on our side, so no embargo is needed.
  const writeLatencyMs = 10;

  const widget = Far('widget', { ping: () => 'pong' });
  const broker = Far('broker', {
    getWidget: () => widget,
  });

  const bObjectTable = new Map();
  bObjectTable.set('broker', broker);

  const clientKitA = await makeTestClient({
    debugLabel: 'A',
    writeLatencyMs,
  });
  const clientKitB = await makeTestClient({
    debugLabel: 'B',
    makeDefaultSwissnumTable: () => bObjectTable,
    writeLatencyMs,
  });

  try {
    const sessionAtoB = await clientKitA.debug.provideInternalSession(
      clientKitB.location,
    );
    const bootstrapBfromA = sessionAtoB.ocapn.getRemoteBootstrap();
    const remoteBroker = await E(bootstrapBfromA).fetch(
      encodeSwissnum('broker'),
    );

    const recorder = createMessageRecorder(sessionAtoB.ocapn, 'A', 'B');

    const widgetPromise = E(remoteBroker).getWidget();
    const result = await E(widgetPromise).ping();

    recorder.unsubscribe();

    t.is(result, 'pong');

    const disembargos = recorder.transcript.filter(
      e => /** @type {any} */ (e.message).type === 'op:disembargo',
    );
    t.is(
      disembargos.length,
      0,
      'no disembargo messages should be sent when shortening is to a remote value',
    );
  } finally {
    clientKitA.client.shutdown();
    clientKitB.client.shutdown();
  }
});
