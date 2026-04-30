/* eslint-disable no-nested-ternary */
import test from 'ava';
import '../index.js';

const { is } = Object;

// Only 3 sizes, so don't bother anstracting. But please, either maintain
// these three `tame-nan*-sidechannel.test.js` files together
// or refactor to something less irritating than duplication.

test('taming NaN64 DataView side-channel', t => {
  t.is(typeof Float32Array, 'function');
  t.true('getFloat32' in DataView.prototype);
  t.true('setFloat32' in DataView.prototype);

  const canonicalNaN64Encoding = 0x7ff8000000000000n;
  const otherNaN64Encoding = 0xfff8000000000000n;

  // This is the JavaScript analog to a C union: a way to map between a float as a
  // number and the bits that represent the float as a buffer full of bytes.  Note
  // that the mutation of static state here makes this invalid Jessie code, but
  // doing it this way saves the nugatory and gratuitous allocations that would
  // happen every time you do a conversion -- and in practical terms it's safe
  // because we put the value in one side and then immediately take it out the
  // other; there is no actual state retained in the classic sense and thus no
  // re-entrancy issue.
  const { buffer: hiddenBuffer } = new BigUint64Array(1);
  const bufferView = new DataView(hiddenBuffer);

  /**
   * @param {bigint} n
   * @returns {string}
   */
  const show = n =>
    n === canonicalNaN64Encoding
      ? 'canonical'
      : n === otherNaN64Encoding
        ? 'other'
        : `0x${n.toString(16)}n`;

  bufferView.setBigUint64(0, otherNaN64Encoding);
  const someNaN = bufferView.getFloat64(0, false);
  t.true(is(someNaN, NaN));
  bufferView.setFloat64(0, someNaN, false);
  const dirtyNaNEncoding = bufferView.getBigUint64(0);
  // We cannot test for non-canonical, since it depends on the platform.
  // Instead, we just show it.
  t.log('before lockdown() other NaN ->', show(dirtyNaNEncoding), 'NaN');

  lockdown();
  bufferView.setBigUint64(0, otherNaN64Encoding);
  const tamedNaN = bufferView.getFloat64(0, false);
  t.true(is(tamedNaN, NaN));
  bufferView.setFloat64(0, tamedNaN, false);
  t.is(bufferView.getBigUint64(0), canonicalNaN64Encoding);

  // Adapted reproducer from https://github.com/endojs/endo/issues/3202
  const dv = new DataView(new ArrayBuffer(16));
  dv.setFloat64(0, NaN, true);
  t.deepEqual(
    Array.from(new Uint8Array(dv.buffer, 0, 8)),
    [0, 0, 0, 0, 0, 0, 248, 127],
  );
  t.is(dv.getFloat64(0, true), NaN);

  // Check that the late object->number coercion attack is
  // fixed by our own early coercion.
  for (let i = 0; i < 1000; i += 1) {
    const view = new DataView(new Uint8Array(8).buffer);
    view.setFloat64(
      0,
      // @ts-expect-error I intend to use an object where TO expects a number.
      { valueOf: () => [-NaN][0] },
      false,
    );
    const actualNaN64Encoding = view.getBigUint64(0, false);
    t.is(actualNaN64Encoding, canonicalNaN64Encoding, `at iteration ${i}`);
    if (actualNaN64Encoding !== canonicalNaN64Encoding) {
      break;
    }
  }
});
