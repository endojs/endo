/* global ImmutableArrayBuffer */
// TODO make the above global declaration unnecessary.
// TODO ensure ImmutableArrayBuffer is typed like ArrayBuffer is typed
// Where are these configured?

import test from 'ava';
import '../index.js';

const { isFrozen } = Object;

lockdown();

test('ImmutableArrayBuffer installed and hardened', t => {
  t.true(isFrozen(ImmutableArrayBuffer));
  t.true(isFrozen(ImmutableArrayBuffer.isView));
  t.true(isFrozen(ImmutableArrayBuffer.prototype));
  t.true(isFrozen(ImmutableArrayBuffer.prototype.slice));
});

test('ImmutableArrayBuffer ops', t => {
  const ab1 = new ArrayBuffer(2, { maxByteLength: 7 });
  const ta1 = new Uint8Array(ab1);
  ta1[0] = 3;
  ta1[1] = 4;
  const iab = new ImmutableArrayBuffer(ab1);
  t.true(iab instanceof ImmutableArrayBuffer);
  t.false(iab instanceof ArrayBuffer);
  ta1[1] = 5;
  const ab2 = iab.slice(0);
  const ta2 = new Uint8Array(ab2);
  t.is(ta1[1], 5);
  t.is(ta2[1], 4);
  ta2[1] = 6;

  const ab3 = iab.slice(0);
  t.false(ab3 instanceof ImmutableArrayBuffer);
  t.true(ab3 instanceof ArrayBuffer);

  const ta3 = new Uint8Array(ab3);
  t.is(ta1[1], 5);
  t.is(ta2[1], 6);
  t.is(ta3[1], 4);

  t.false(ArrayBuffer.isView({}));
  t.false(ImmutableArrayBuffer.isView({}));
  const dv1 = new DataView(ab1);
  t.true(ArrayBuffer.isView(dv1));
  t.true(ImmutableArrayBuffer.isView(dv1));

  t.is(ImmutableArrayBuffer[Symbol.species], ImmutableArrayBuffer);

  t.is(ab1.byteLength, 2);
  t.is(iab.byteLength, 2);
  t.is(ab2.byteLength, 2);

  t.is(iab.maxByteLength, 2);
  if ('maxByteLength' in ab1) {
    // ArrayBuffer.p.maxByteLength absent from Node 18
    t.is(ab1.maxByteLength, 7);
    t.is(ab2.maxByteLength, 2);
  }

  t.false(iab.detached);
  t.false(iab.resizable);
});

// This could have been written as a test.failing as compared to
// the ImmutableArrayBuffer we'll propose. However, I'd rather test what
// the shim purposesly does instead.
test('ImmutableArrayBuffer shim limitations', t => {
  const ab1 = new ArrayBuffer(2);
  const dv1 = new DataView(ab1);
  t.is(dv1.buffer, ab1);
  t.is(dv1.byteLength, 2);
  const ta1 = new Uint8Array(ab1);
  ta1[0] = 3;
  ta1[1] = 4;
  t.is(ta1.byteLength, 2);

  t.throws(() => new DataView({}), { instanceOf: TypeError });
  // Unfortutanely, calling a TypeArray constructor with an object that
  // is not a TypeArray, ArrayBuffer, or Iterable just creates a useless
  // empty TypedArray, rather than throwing.
  const ta2 = new Uint8Array({});
  t.is(ta2.byteLength, 0);

  const iab = new ImmutableArrayBuffer(ab1);
  t.throws(() => new DataView(iab), {
    instanceOf: TypeError,
  });
  // Unfortunately, unlike the ImmutableArrayBuffer to be proposed,
  // calling a TypedArray constructor with the shim implementation of
  // ImmutableArrayBuffer as argument treats it as an unrecognized object,
  // rather than throwing an error.
  t.is(iab.byteLength, 2);
  const ta3 = new Uint8Array(iab);
  t.is(ta3.byteLength, 0);
});
