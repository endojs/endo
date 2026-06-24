// @ts-nocheck
/* global setTimeout, setInterval, clearInterval */
import test from '@endo/ses-ava/prepare-endo.js';

import { makeIrohHeartbeat } from '../src/networks/iroh-heartbeat.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * A controllable fake iroh Connection. `sendDatagram` records outbound beats;
 * `readDatagram` resolves once a datagram is pushed in, modelling inbound
 * traffic from the peer.
 */
const makeFakeConnection = () => {
  const sent = [];
  const inbox = [];
  const waiters = [];
  const deliver = () => {
    while (waiters.length > 0 && inbox.length > 0) {
      const resolve = waiters.shift();
      resolve(inbox.shift());
    }
  };
  return {
    sent,
    push(datagram) {
      inbox.push(datagram);
      deliver();
    },
    sendDatagram(data) {
      sent.push(data);
    },
    readDatagram() {
      return new Promise(resolve => {
        waiters.push(resolve);
        deliver();
      });
    },
  };
};

test('emits heartbeat datagrams on the interval', async t => {
  t.timeout(5000);
  const connection = makeFakeConnection();
  const heartbeat = makeIrohHeartbeat(connection, {
    intervalMs: 20,
    timeoutMs: 10_000,
  });
  t.teardown(() => heartbeat.stop());

  await delay(95);
  heartbeat.stop();
  // One immediate beat plus several interval beats.
  t.true(
    connection.sent.length >= 3,
    `expected several beats, got ${connection.sent.length}`,
  );
});

test('inbound datagrams keep the session alive', async t => {
  t.timeout(5000);
  const connection = makeFakeConnection();
  let timeouts = 0;
  // A long send interval so only the injected inbound datagrams re-arm the
  // watchdog.
  const heartbeat = makeIrohHeartbeat(connection, {
    intervalMs: 10_000,
    timeoutMs: 50,
    onTimeout: () => {
      timeouts += 1;
    },
  });
  t.teardown(() => heartbeat.stop());

  const feed = setInterval(() => connection.push(new Uint8Array([1])), 20);
  t.teardown(() => clearInterval(feed));

  await delay(160);
  t.is(timeouts, 0, 'a peer that keeps answering is never presumed dead');
});

test('presumes the peer dead after the keep-alive window of silence', async t => {
  t.timeout(5000);
  const connection = makeFakeConnection();
  let timeouts = 0;
  // A long send interval so only the inbound datagram drives the watchdog.
  const heartbeat = makeIrohHeartbeat(connection, {
    intervalMs: 10_000,
    timeoutMs: 50,
    onTimeout: () => {
      timeouts += 1;
    },
  });
  t.teardown(() => heartbeat.stop());

  // One inbound beat arms the watchdog; then the peer falls silent.
  connection.push(new Uint8Array([1]));
  await delay(180);
  t.is(timeouts, 1, 'onTimeout fires exactly once after the peer falls silent');
  const afterTimeout = connection.sent.length;
  await delay(80);
  t.is(
    connection.sent.length,
    afterTimeout,
    'beats halt once the peer is dead',
  );
});

test('does not presume death until the peer has first heartbeated', async t => {
  t.timeout(5000);
  const connection = makeFakeConnection();
  let timeouts = 0;
  const heartbeat = makeIrohHeartbeat(connection, {
    intervalMs: 10_000,
    timeoutMs: 50,
    onTimeout: () => {
      timeouts += 1;
    },
  });
  t.teardown(() => heartbeat.stop());

  // The peer never sends a datagram (e.g. an older daemon without heartbeats).
  // The watchdog stays disarmed, leaving teardown to iroh's QUIC idle timeout.
  await delay(160);
  t.is(
    timeouts,
    0,
    'a never-heartbeating peer is not torn down by the watchdog',
  );
});

test('stop halts heartbeats and disarms the watchdog', async t => {
  t.timeout(5000);
  const connection = makeFakeConnection();
  let timeouts = 0;
  const heartbeat = makeIrohHeartbeat(connection, {
    intervalMs: 20,
    timeoutMs: 50,
    onTimeout: () => {
      timeouts += 1;
    },
  });
  heartbeat.stop();
  const sentAtStop = connection.sent.length;

  await delay(160);
  t.is(timeouts, 0, 'no keep-alive timeout after stop');
  t.is(connection.sent.length, sentAtStop, 'no beats after stop');
});

test('disables itself when the connection lacks datagram support', async t => {
  t.timeout(5000);
  let timeouts = 0;
  // No sendDatagram/readDatagram on the connection.
  const heartbeat = makeIrohHeartbeat(
    {},
    {
      intervalMs: 20,
      timeoutMs: 50,
      onTimeout: () => {
        timeouts += 1;
      },
    },
  );
  t.teardown(() => heartbeat.stop());

  await delay(120);
  t.is(timeouts, 0, 'no watchdog without a datagram channel to observe');
});

test('a failing sendDatagram is caught and reported', async t => {
  t.timeout(5000);
  const logs = [];
  const connection = {
    sendDatagram() {
      throw new Error('buffer full');
    },
    readDatagram() {
      return new Promise(() => {});
    },
  };
  const heartbeat = makeIrohHeartbeat(connection, {
    intervalMs: 20,
    timeoutMs: 10_000,
    log: message => logs.push(message),
  });
  t.teardown(() => heartbeat.stop());

  await delay(60);
  heartbeat.stop();
  t.true(
    logs.some(message => message.includes('heartbeat send failed')),
    'send failures surface through the log sink',
  );
});

test('a non-Error thrown by sendDatagram is rendered without re-throwing', async t => {
  // Native bindings can throw arbitrary values, not just `Error` instances.
  // Reaching for `.message` on a `null` throw would itself throw and crash
  // the heartbeat loop; the loop must survive that case.
  t.timeout(5000);
  const logs = [];
  let beats = 0;
  const connection = {
    sendDatagram() {
      beats += 1;
      // eslint-disable-next-line no-throw-literal
      throw null;
    },
    readDatagram() {
      return new Promise(() => {});
    },
  };
  const heartbeat = makeIrohHeartbeat(connection, {
    intervalMs: 20,
    timeoutMs: 10_000,
    log: message => logs.push(message),
  });
  t.teardown(() => heartbeat.stop());

  await delay(80);
  t.true(beats >= 2, 'the heartbeat loop survives a non-Error throw');
  t.true(
    logs.some(message => message.includes('heartbeat send failed')),
    'a non-Error throw still surfaces through the log sink',
  );
});

test('timeoutMs defaults to twice the chosen intervalMs', async t => {
  // The documented "tolerate a single dropped beat" invariant must hold for
  // callers that only override `intervalMs`. A 30ms interval should yield a
  // ~60ms watchdog window, so silence past ~80ms must fire the timeout.
  t.timeout(5000);
  const connection = makeFakeConnection();
  let timeouts = 0;
  const heartbeat = makeIrohHeartbeat(connection, {
    intervalMs: 30,
    onTimeout: () => {
      timeouts += 1;
    },
  });
  t.teardown(() => heartbeat.stop());

  // Arm the watchdog with one inbound beat, then let the peer fall silent.
  connection.push(new Uint8Array([1]));
  await delay(140);
  t.is(
    timeouts,
    1,
    'derived timeoutMs (2 * intervalMs) fires after the silence window',
  );
});
