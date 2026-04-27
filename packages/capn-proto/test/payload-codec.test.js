import test from '@endo/ses-ava/test.js';
import { encodePayload, decodePayload } from '../src/payload-codec.js';

test('round-trips primitives, arrays, and plain records', t => {
  const ctx = {
    exportCap: () => ({ kind: 'senderHosted', id: 0 }),
    isCap: () => false,
  };
  const payload = encodePayload(
    { name: 'alice', n: 7, arr: [1, 2, 'three', true] },
    ctx,
  );
  const dec = decodePayload(payload, { importCap: () => undefined });
  t.deepEqual(dec, { name: 'alice', n: 7, arr: [1, 2, 'three', true] });
});

test('bigint and Uint8Array survive the round trip', t => {
  const ctx = { exportCap: () => ({ kind: 'none' }), isCap: () => false };
  const bytes = new Uint8Array([1, 2, 3, 254, 255]);
  const payload = encodePayload({ big: 12345678901234567890n, bytes }, ctx);
  const dec = decodePayload(payload, { importCap: () => undefined });
  t.is(dec.big, 12345678901234567890n);
  t.deepEqual(Array.from(dec.bytes), Array.from(bytes));
});

test('cap markers route through capTable', t => {
  const counter = { n: 0 };
  const ctx = {
    isCap: v => v && v.__cap === true,
    exportCap: v => {
      counter.n += 1;
      return { kind: 'senderHosted', id: counter.n };
    },
  };
  const cap = { __cap: true };
  const payload = encodePayload({ a: cap, list: [cap, 'plain'] }, ctx);
  t.is(payload.capTable.length, 1, 'duplicate caps are deduplicated');
  const importedFor = idx => ({ presence: idx + 100 });
  const dec = decodePayload(payload, { importCap: (_d, i) => importedFor(i) });
  t.deepEqual(dec.a, importedFor(0));
  t.deepEqual(dec.list[0], importedFor(0));
  t.is(dec.list[1], 'plain');
});
