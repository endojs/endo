// @ts-nocheck
import test from '@endo/ses-ava/test.js';
import { encodeDisembargo, decodeMessage } from '../src/index.js';
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
