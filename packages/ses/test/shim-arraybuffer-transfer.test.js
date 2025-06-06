// @ts-nocheck
/* global globalThis */
import test from 'ava';
import '../index.js';

lockdown();

// The purpose of this test is to see if Array.prototype.transfer works
// correctly enough on platforms like Node 18 or Node 20 that don't yet have
// it natively, and so are testing the shim on those. On platforms where
// Array.prototype.transfer is present, like Node 22,
// we also run the same tests. Thus,
// this test only tests the intersection behavior of the standard and
// the shim.

test('ArrayBuffer.p.transfer', t => {
  const abX = new ArrayBuffer(3);
  t.is(abX.byteLength, 3);
  const taX = new Uint8Array(abX);
  t.is(taX[2], 0);
  t.is(taX[3], undefined);
  taX[0] = 10;
  taX[1] = 11;
  taX[2] = 12;
  t.is(taX[0], 10);
  t.is(taX[1], 11);
  t.is(taX[2], 12);
  t.is(taX[3], undefined);

  if (!('transfer' in ArrayBuffer.prototype)) {
    t.false('structuredClone' in globalThis);
    // Currently, shim-arraybuffer-transfer.shim, when run on a platform
    // with neither `Array.prototype.transfer` nor `structuredClone` does
    // not shim `Array.prototype.transfer`. Thus, we currently do not
    // consider this absence to be a non-conformance to the endo ses-shim.
    return;
  }

  // because this test must run on platforms prior to
  // ArrayBuffer.prototype.detached, we test detachment by other means.

  const abY = abX.transfer();
  t.is(abY.byteLength, 3);
  t.is(abX.byteLength, 0);
  const taY = new Uint8Array(abY);
  t.is(taX[2], undefined);
  t.is(taY[2], 12);

  const abZ = abY.transfer(2);
  t.is(abY.byteLength, 0);
  t.is(abZ.byteLength, 2);
  const taZ = new Uint8Array(abZ);
  t.is(taY[2], undefined);
  t.is(taZ[0], 10);
  t.is(taZ[1], 11);
  t.is(taZ[2], undefined);

  const abW = abZ.transfer(4);
  t.is(abZ.byteLength, 0);
  t.is(abW.byteLength, 4);
  const taW = new Uint8Array(abW);
  t.is(taZ[2], undefined);
  t.is(taW[0], 10);
  t.is(taW[1], 11);
  t.is(taW[2], 0);
  t.is(taW[3], 0);
  t.is(taW[4], undefined);
});
