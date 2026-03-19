/* eslint-disable no-nested-ternary */
import test from 'ava';
import '../index.js';

const { is } = Object;

const canonicalNaNEncoding = 0x7ff8000000000000n;
const otherNaNEncoding = 0xfff8000000000000n;

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
  n === canonicalNaNEncoding
    ? 'canonical'
    : n === otherNaNEncoding
      ? 'other'
      : `0x${n.toString(16)}n`;

test('taming NaN DataView side-channel', t => {
  bufferView.setBigUint64(0, otherNaNEncoding);
  const someNaN = bufferView.getFloat64(0);
  t.true(is(someNaN, NaN));
  bufferView.setFloat64(0, someNaN);
  const dirtyNaNEncoding = bufferView.getBigUint64(0);
  // We cannot test for non-canonical, since it depends on the platform.
  // Instead, we just show it.
  t.log(show(dirtyNaNEncoding), 'NaN');

  lockdown();
  bufferView.setBigUint64(0, otherNaNEncoding);
  const tamedNaN = bufferView.getFloat64(0);
  t.true(is(tamedNaN, NaN));
  bufferView.setFloat64(0, tamedNaN);
  t.is(bufferView.getBigUint64(0), canonicalNaNEncoding);
});
