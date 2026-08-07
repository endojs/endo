import test from '@endo/ses-ava/test.js';
import { frameSegments, unframeSegments } from '../../src/wire/framing.js';

const word = bytes => {
  const buf = new ArrayBuffer(bytes.length);
  new Uint8Array(buf).set(bytes);
  return buf;
};

test('framing single segment round-trips', t => {
  const seg = word(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
  const framed = frameSegments([seg]);
  const out = unframeSegments(framed);
  t.is(out.length, 1);
  t.deepEqual(new Uint8Array(out[0]), new Uint8Array(seg));
});

test('framing multiple segments round-trips', t => {
  const segs = [
    word(new Uint8Array(8).fill(0xaa)),
    word(new Uint8Array(16).fill(0xbb)),
    word(new Uint8Array(24).fill(0xcc)),
  ];
  const framed = frameSegments(segs);
  const out = unframeSegments(framed);
  t.is(out.length, 3);
  for (let i = 0; i < segs.length; i += 1) {
    t.deepEqual(new Uint8Array(out[i]), new Uint8Array(segs[i]));
  }
});

test('framing single-segment header is 8 bytes (segCountMinusOne=0 then padded)', t => {
  const seg = word(new Uint8Array(8));
  const framed = frameSegments([seg]);
  // 4 bytes of (n-1)=0 + 4 bytes of segLen=1 + 8 bytes payload = 16
  t.is(framed.byteLength, 16);
  const view = new DataView(framed);
  t.is(view.getUint32(0, true), 0);
  t.is(view.getUint32(4, true), 1);
});
