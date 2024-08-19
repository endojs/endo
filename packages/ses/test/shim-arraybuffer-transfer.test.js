import test from 'ava';
import '../index.js';

lockdown();

// The purpose of this test is to see if Array.prototype.transfer works
// correctly enough on platforms like Node 18 or Node 20 that don't yet have
// it natively, and so are testing the shim on those. On platforms where
// Array.prototype.transfer is present, like Node 22,
// we also run the same tests.Thus,
// this test only tests the intersection behavior of the standard and
// the shim. The shim does not yet support a `newLength` argument
// larger than the original.
//
// TODO once the shim supports transfering to a larger length, we must
// test that as well.

test('ArrayBuffer.p.transfer', t => {
  const abX = new ArrayBuffer(3);
  t.is(abX.byteLength, 3);
  const taX = new Uint8Array(abX);
  t.is(taX[2], 0);
  t.is(taX[3], undefined);

  // because this test must run on platforms prior to
  // ArrayBuffer.prototype.detached, we test detachment by other means.

  const abY = abX.transfer();
  t.is(abY.byteLength, 3);
  t.is(abX.byteLength, 0);
  const taY = new Uint8Array(abY);
  t.is(taX[2], undefined);
  t.is(taY[2], 0);

  const abZ = abY.transfer(2);
  t.is(abY.byteLength, 0);
  t.is(abZ.byteLength, 2);
  const taZ = new Uint8Array(abZ);
  t.is(taY[2], undefined);
  t.is(taZ[2], undefined);
  t.is(taZ[1], 0);
});
