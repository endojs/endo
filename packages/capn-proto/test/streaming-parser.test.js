// @ts-nocheck
/**
 * Deterministic unit tests for `makeFramedStreamParser`.
 *
 * The TCP-transport integration tests (test/transport-tcp.test.js,
 * test/interop-rpc.test.js, test/interop-rpc-multi.test.js) all exercise
 * the parser in passing, but TCP chunking is nondeterministic — a Node
 * `net.Socket` may deliver one byte at a time or 64 KB in one shot,
 * depending on host kernel and load. The framed-stream parser must work
 * across both extremes; this file pins down the chunk-splitting edge
 * cases that integration tests alone can't reliably hit:
 *
 *   - a complete message split across many small pushes
 *   - the segment-table header itself split across chunks
 *   - multiple complete messages glued into one chunk
 *   - a message that arrives byte-by-byte
 *   - a message followed by a partial header (no premature emit)
 *   - the >512-segment defensive rejection
 *
 * Each test builds known-good framed bytes via the proto-layer
 * `frameSegments` helper and then drives the parser with deliberate chunk
 * boundaries to exercise the buffering state machine.
 */

import test from '@endo/ses-ava/test.js';

import { frameSegments } from '../src/wire/framing.js';
import { makeFramedStreamParser } from '../src/wire/streaming.js';

/**
 * Build a synthetic framed message with `segCount` segments, each
 * `wordsPerSegment` words. Returns the concatenated framed bytes (one
 * full Cap'n Proto stream-encoded message).
 */
const synthesizeFramed = (segCount, wordsPerSegment = 1) => {
  const segments = [];
  for (let i = 0; i < segCount; i += 1) {
    const seg = new ArrayBuffer(wordsPerSegment * 8);
    // Sentinel byte per segment so we can verify identity on round-trip.
    new Uint8Array(seg)[0] = i % 256;
    segments.push(seg);
  }
  return new Uint8Array(frameSegments(segments));
};

const collect = chunks => {
  const got = [];
  const parser = makeFramedStreamParser({
    onMessage: framed => got.push(new Uint8Array(framed)),
  });
  for (const chunk of chunks) parser.push(chunk);
  return { got, pending: parser.pending() };
};

const bytesEqual = (a, b) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
};

test('parser emits a single message delivered in one push', t => {
  const framed = synthesizeFramed(1, 1);
  const { got, pending } = collect([framed]);
  t.is(got.length, 1);
  t.true(bytesEqual(got[0], framed));
  t.is(pending, 0);
});

test('parser emits a single message delivered byte-by-byte', t => {
  const framed = synthesizeFramed(2, 3);
  // Push every byte in its own chunk; only the final byte completes the
  // message, so we should see exactly one emission.
  const { got, pending } = collect(
    Array.from(framed, b => new Uint8Array([b])),
  );
  t.is(got.length, 1);
  t.true(bytesEqual(got[0], framed));
  t.is(pending, 0);
});

test('parser handles header split across chunks', t => {
  const framed = synthesizeFramed(3, 2);
  // Header for 3 segments is 4 (count-1) + 3*4 (lens) = 16 bytes; pad to
  // 8-byte alignment makes 16 (already aligned). Split mid-header at byte 6.
  const a = framed.subarray(0, 6);
  const b = framed.subarray(6);
  const { got, pending } = collect([a, b]);
  t.is(got.length, 1);
  t.true(bytesEqual(got[0], framed));
  t.is(pending, 0);
});

test('parser emits multiple messages glued in one chunk', t => {
  const m1 = synthesizeFramed(1, 1);
  const m2 = synthesizeFramed(2, 2);
  const m3 = synthesizeFramed(1, 4);
  const glued = new Uint8Array(m1.length + m2.length + m3.length);
  glued.set(m1, 0);
  glued.set(m2, m1.length);
  glued.set(m3, m1.length + m2.length);
  const { got, pending } = collect([glued]);
  t.is(got.length, 3);
  t.true(bytesEqual(got[0], m1));
  t.true(bytesEqual(got[1], m2));
  t.true(bytesEqual(got[2], m3));
  t.is(pending, 0);
});

test('parser holds a partial trailing message until completed', t => {
  const m1 = synthesizeFramed(1, 1);
  const m2 = synthesizeFramed(1, 3);
  // Push m1 + first half of m2, then the rest. The first push should emit
  // exactly m1 with the partial m2 buffered.
  const part1 = new Uint8Array(m1.length + Math.floor(m2.length / 2));
  part1.set(m1, 0);
  part1.set(m2.subarray(0, Math.floor(m2.length / 2)), m1.length);
  const part2 = m2.subarray(Math.floor(m2.length / 2));

  const got = [];
  const parser = makeFramedStreamParser({
    onMessage: framed => got.push(new Uint8Array(framed)),
  });
  parser.push(part1);
  t.is(got.length, 1, 'first push should emit only the complete message');
  t.true(bytesEqual(got[0], m1));
  t.true(parser.pending() > 0, 'partial m2 should still be buffered');

  parser.push(part2);
  t.is(got.length, 2);
  t.true(bytesEqual(got[1], m2));
  t.is(parser.pending(), 0);
});

test('parser rejects a message claiming more than 512 segments', t => {
  // Hand-craft a header with segCount-minus-1 = 512 (so segCount = 513).
  // Since the parser short-circuits before reading per-segment lengths,
  // the buffer only needs the first 4 bytes.
  const buf = new Uint8Array(4);
  new DataView(buf.buffer).setUint32(0, 512, true);
  const parser = makeFramedStreamParser({ onMessage: () => {} });
  t.throws(() => parser.push(buf), {
    message: /segment count.*exceeds 512/,
  });
});

test('parser preserves byte identity across all chunk boundaries', t => {
  // Concatenate three messages; iterate through every possible single
  // split point and assert the full set of three round-trips correctly.
  const m1 = synthesizeFramed(1, 1);
  const m2 = synthesizeFramed(2, 1);
  const m3 = synthesizeFramed(1, 2);
  const full = new Uint8Array(m1.length + m2.length + m3.length);
  full.set(m1, 0);
  full.set(m2, m1.length);
  full.set(m3, m1.length + m2.length);

  for (let split = 0; split <= full.length; split += 1) {
    const got = [];
    const parser = makeFramedStreamParser({
      onMessage: framed => got.push(new Uint8Array(framed)),
    });
    parser.push(full.subarray(0, split));
    parser.push(full.subarray(split));
    t.is(got.length, 3, `split=${split}: expected 3 messages`);
    t.true(bytesEqual(got[0], m1), `split=${split}: m1 mismatch`);
    t.true(bytesEqual(got[1], m2), `split=${split}: m2 mismatch`);
    t.true(bytesEqual(got[2], m3), `split=${split}: m3 mismatch`);
    t.is(parser.pending(), 0, `split=${split}: pending should be drained`);
  }
});

test('parser tolerates an empty push (no-op)', t => {
  const parser = makeFramedStreamParser({
    onMessage: () => t.fail('should not emit on empty input'),
  });
  parser.push(new Uint8Array(0));
  t.is(parser.pending(), 0);
});

test('parser handles a Buffer-typed view (Node spawn-style)', t => {
  // `socket.on('data', chunk)` on Node delivers a Buffer (a Uint8Array
  // subclass with non-zero byteOffset when sliced). Verify the parser
  // handles both ArrayBuffer-backed Uint8Arrays and Buffer-style
  // typed-array views with arbitrary byteOffset.
  const framed = synthesizeFramed(2, 1);
  const padded = new Uint8Array(framed.length + 16);
  padded.set(framed, 7);
  // View with a non-zero offset so that `chunk.buffer` includes unrelated
  // padding bytes; the parser must use byteOffset/byteLength, not buffer
  // directly.
  const view = padded.subarray(7, 7 + framed.length);
  const got = [];
  const parser = makeFramedStreamParser({
    onMessage: m => got.push(new Uint8Array(m)),
  });
  parser.push(view);
  t.is(got.length, 1);
  t.true(bytesEqual(got[0], framed));
});
