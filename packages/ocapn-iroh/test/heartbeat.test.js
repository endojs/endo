// @ts-check
import test from '@endo/ses-ava/test.js';

import { makeIrohHeartbeat } from '../src/heartbeat.js';

/** @param {number} ms */
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * A controllable fake iroh Connection. `sendDatagram` records outbound beats;
 * `readDatagram` resolves once a datagram is pushed in, modelling inbound
 * traffic from the peer. Like the NAPI-RS binding's native methods, the
 * datagram methods refuse to run unless `this` is the connection, so a
 * regression to calling them through a destructured reference fails loudly
 * ("Illegal invocation") instead of silently passing against a fake that
 * ignores its receiver.
 */
const makeFakeConnection = () => {
  /** @type {number[][]} */
  const sent = [];
  /** @type {unknown[]} */
  const inbox = [];
  /** @type {((datagram: unknown) => void)[]} */
  const waiters = [];
  const deliver = () => {
    while (waiters.length > 0 && inbox.length > 0) {
      const resolve = waiters.shift();
      if (resolve) {
        resolve(inbox.shift());
      }
    }
  };
  const connection = {
    sent,
    inbox,
    /** @param {unknown} datagram */
    push(datagram) {
      inbox.push(datagram);
      deliver();
    },
    /** @param {number[]} data */
    sendDatagram(data) {
      if (this !== connection) {
        throw new TypeError('Illegal invocation');
      }
      sent.push(data);
    },
    readDatagram() {
      if (this !== connection) {
        throw new TypeError('Illegal invocation');
      }
      return new Promise(resolve => {
        waiters.push(resolve);
        deliver();
      });
    },
  };
  return connection;
};

test('calls native datagram methods with the connection as receiver', async t => {
  t.timeout(5000);
  const connection = makeFakeConnection();
  /** @type {string[]} */
  const failures = [];
  const heartbeat = makeIrohHeartbeat(connection, {
    intervalMs: 20,
    timeoutMs: 10_000,
    log: message => failures.push(message),
  });
  t.teardown(() => heartbeat.stop());

  connection.push(new Uint8Array([1]));
  await delay(60);
  t.true(connection.sent.length >= 1, 'beats reach the receiver-checking fake');
  t.is(connection.inbox.length, 0, 'the pump drains inbound datagrams');
  t.deepEqual(failures, [], 'no datagram call fell back to the failure log');
});
