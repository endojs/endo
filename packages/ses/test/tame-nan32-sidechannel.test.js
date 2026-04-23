/* eslint-disable no-nested-ternary */
import test from 'ava';
import '../index.js';

const { is } = Object;

// Only 3 sizes, so don't bother anstracting. But please, either maintain
// these three `tame-nan*-sidechannel.test.js` files together
// or refactor to something less irritating than duplication.

test('taming NaN32 DataView side-channel', t => {
  const canonicalNaN32Encoding = 0x7ff80000;
  const otherNaN32Encoding = 0xfff80000;

  // This is the JavaScript analog to a C union: a way to map between a float as a
  // number and the bits that represent the float as a buffer full of bytes.  Note
  // that the mutation of static state here makes this invalid Jessie code, but
  // doing it this way saves the nugatory and gratuitous allocations that would
  // happen every time you do a conversion -- and in practical terms it's safe
  // because we put the value in one side and then immediately take it out the
  // other; there is no actual state retained in the classic sense and thus no
  // re-entrancy issue.
  const { buffer: hiddenBuffer } = new Uint32Array(1);
  const bufferView = new DataView(hiddenBuffer);

  /**
   * @param {number} n
   * @returns {string}
   */
  const show = n =>
    n === canonicalNaN32Encoding
      ? 'canonical'
      : n === otherNaN32Encoding
        ? 'other'
        : `0x${n.toString(16)}n`;

  bufferView.setUint32(0, otherNaN32Encoding);
  const someNaN = bufferView.getFloat32(0, false);
  t.true(is(someNaN, NaN));
  bufferView.setFloat32(0, someNaN, false);
  const dirtyNaNEncoding = bufferView.getUint32(0);
  // We cannot test for non-canonical, since it depends on the platform.
  // Instead, we just show it.
  t.log(show(dirtyNaNEncoding), 'NaN');

  lockdown();
  bufferView.setUint32(0, otherNaN32Encoding);
  const tamedNaN = bufferView.getFloat32(0, false);
  t.true(is(tamedNaN, NaN));
  bufferView.setFloat32(0, tamedNaN, false);
  t.is(bufferView.getUint32(0), canonicalNaN32Encoding);

  // Adapted reproducer from https://github.com/endojs/endo/issues/3202
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat32(0, NaN, true);
  t.deepEqual(Array.from(new Uint8Array(dv.buffer, 0, 4)), [0, 0, 248, 127]);
  t.is(dv.getFloat32(0, true), NaN);
});
