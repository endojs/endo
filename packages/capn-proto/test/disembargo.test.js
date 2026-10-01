// @ts-nocheck
import test from '@endo/ses-ava/test.js';
import {
  encodeDisembargo,
  decodeMessage,
  makeCapnp,
  makeInterfaceRegistry,
} from '../src/index.js';
import { makeEmbargoTracker } from '../src/embargo.js';

test('senderLoopback round-trips through encode/decode', t => {
  const framed = encodeDisembargo({
    target: { kind: 'importedCap', id: 1 },
    context: { kind: 'senderLoopback', id: 99 },
  });
  const m = decodeMessage(framed);
  t.is(m.context.kind, 'senderLoopback');
  t.is(m.context.id, 99);
});

test('embargo tracker echo invokes the callback exactly once', t => {
  const tr = makeEmbargoTracker();
  let called = 0;
  const id = tr.open(() => {
    called += 1;
  });
  t.is(tr.outstanding(), 1);
  tr.echo(id);
  t.is(called, 1);
  t.is(tr.outstanding(), 0);
  // Subsequent echo is a no-op.
  tr.echo(id);
  t.is(called, 1);
});

test('senderLoopback Disembargo received by peer is echoed back as receiverLoopback', async t => {
  // Wire two makeCapnp instances together. Inject a senderLoopback
  // Disembargo into one side via dispatch() and observe the receiverLoopback
  // echo on the other side.
  const reg = makeInterfaceRegistry();
  /** @type {ArrayBuffer[]} */
  const aOut = [];
  /** @type {ArrayBuffer[]} */
  const bOut = [];
  const a = makeCapnp({
    send: framed => aOut.push(framed),
    interfaceRegistry: reg,
  });
  const b = makeCapnp({
    send: framed => bOut.push(framed),
    interfaceRegistry: reg,
  });

  // A sends senderLoopback{id=42} addressed at importedCap{id=7}. (We
  // inject the message directly into B's dispatch — equivalent to a wire
  // delivery.)
  const senderEchoFramed = encodeDisembargo({
    target: { kind: 'importedCap', id: 7 },
    context: { kind: 'senderLoopback', id: 42 },
  });
  b.dispatch(senderEchoFramed);

  // B's handleDisembargo for senderLoopback enqueues the echo on the next
  // microtask. Drain.
  await Promise.resolve();
  await Promise.resolve();

  t.is(bOut.length, 1, 'B emitted exactly one echo message');
  const decoded = decodeMessage(bOut[0]);
  t.is(decoded.type, 'disembargo');
  t.is(
    decoded.context.kind,
    'receiverLoopback',
    'echo flips to receiverLoopback',
  );
  t.is(decoded.context.id, 42, 'echo preserves the senderLoopback id');
  t.is(decoded.target.kind, 'importedCap', 'echo preserves the target kind');
  t.is(decoded.target.id, 7, 'echo preserves the target id');

  // A side note: aOut should be empty — A didn't send anything in this
  // exchange (we hand-crafted the senderLoopback rather than going through
  // A's tracker).
  t.is(aOut.length, 0, 'A sent nothing; the exchange was one-directional');

  a.abort('done');
  b.abort('done');
});

test('multiple embargoes are tracked independently', t => {
  const tr = makeEmbargoTracker();
  const a = [];
  const id1 = tr.open(() => a.push(1));
  const id2 = tr.open(() => a.push(2));
  t.is(tr.outstanding(), 2);
  tr.echo(id2);
  t.deepEqual(a, [2]);
  tr.echo(id1);
  t.deepEqual(a, [2, 1]);
  t.is(tr.outstanding(), 0);
});
