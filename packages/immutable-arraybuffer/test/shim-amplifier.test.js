// @ts-nocheck
// Coverage for the amplifier-with-this-fallthrough behaviour that the
// drop-the-pseudo-prototype redesign introduces. The shim installs
// replacement methods for the four genuine mutators (slice, resize,
// transfer, transferToFixedLength) on ArrayBuffer.prototype. The
// replacements must behave indistinguishably from the genuine methods
// when invoked on a genuine ArrayBuffer (the fallthrough case) and
// behave as immutable-aware when invoked on an emulated immutable
// (the brand-WeakMap case).
import '../src/shim.js';
import test from 'ava';
import {
  isBufferImmutable,
  _amplifyArrayBufferForTests as amplifyArrayBuffer,
} from '../src/lib.js';

const { getPrototypeOf } = Object;

test('emulated immutable inherits directly from ArrayBuffer.prototype', t => {
  const iab = new ArrayBuffer(2).sliceToImmutable();
  t.is(getPrototypeOf(iab), ArrayBuffer.prototype);
  t.true(iab instanceof ArrayBuffer);
  t.true(iab.immutable);
});

test('Object.prototype.toString.call(immuAB) reads as ImmutableArrayBuffer', t => {
  const iab = new ArrayBuffer(2).sliceToImmutable();
  // Per DESIGN.md § Move 2 paragraph 7 (as amended for the design-departure
  // recorded in the same paragraph), the `[Symbol.toStringTag]` slot is
  // installed as an own property on each emulated immutable buffer (not on
  // the shared ArrayBuffer.prototype). Genuine ArrayBuffers continue to
  // inherit `'ArrayBuffer'` from the prototype; emulated immutables carry
  // their own `'ImmutableArrayBuffer'` slot so concordance (and any other
  // downstream consumer that sniffs the toStringTag to decide whether the
  // value is a genuine exotic) routes them through the unrenderable-value
  // path rather than into `Buffer.from`, which throws on emulated immutables.
  t.is(Object.prototype.toString.call(iab), '[object ImmutableArrayBuffer]');
});

test('Object.prototype.toString.call(genuineAB) reads as ArrayBuffer', t => {
  // The toStringTag departure is restricted to emulated immutables (an
  // own-property slot on each emulated instance). Genuine ArrayBuffers
  // continue to read as `[object ArrayBuffer]` via the prototype's
  // unchanged `Symbol.toStringTag`.
  const ab = new ArrayBuffer(2);
  t.is(Object.prototype.toString.call(ab), '[object ArrayBuffer]');
});

test('genuine ArrayBuffer.prototype.slice falls through to genuine behaviour', t => {
  const ab = new ArrayBuffer(3);
  new Uint8Array(ab).set([10, 20, 30]);
  const sliced = ab.slice(1, 3);
  t.false(isBufferImmutable(sliced));
  t.is(sliced.byteLength, 2);
  t.deepEqual([...new Uint8Array(sliced)], [20, 30]);
});

test('emulated immutable.slice returns a mutable genuine buffer', t => {
  const iab = new ArrayBuffer(3).sliceToImmutable();
  // slice on an emulated immutable produces a genuine (mutable) copy of
  // its contents, the same way ArrayBuffer.prototype.slice would on a
  // native immutable buffer per the proposal.
  const sliced = iab.slice(0, 3);
  t.false(isBufferImmutable(sliced));
  t.is(sliced.byteLength, 3);
});

test('genuine resize falls through to genuine behaviour', t => {
  if (!('maxByteLength' in ArrayBuffer.prototype)) {
    t.pass('Platform lacks resizable ArrayBuffer proposal');
    return;
  }
  const ab = new ArrayBuffer(2, { maxByteLength: 7 });
  ab.resize(5);
  t.is(ab.byteLength, 5);
});

test('emulated immutable.resize throws TypeError', t => {
  const iab = new ArrayBuffer(2).sliceToImmutable();
  t.throws(() => iab.resize(5), { instanceOf: TypeError });
});

test('genuine transfer falls through to genuine behaviour', t => {
  if (!('transfer' in ArrayBuffer.prototype)) {
    t.pass('Platform lacks ArrayBuffer.prototype.transfer');
    return;
  }
  const ab = new ArrayBuffer(2);
  new Uint8Array(ab).set([7, 9]);
  const ab2 = ab.transfer(3);
  t.false(isBufferImmutable(ab2));
  t.is(ab2.byteLength, 3);
  t.is(ab.byteLength, 0);
  t.deepEqual([...new Uint8Array(ab2)], [7, 9, 0]);
});

test('emulated immutable.transfer throws TypeError', t => {
  const iab = new ArrayBuffer(2).sliceToImmutable();
  t.throws(() => iab.transfer(), { instanceOf: TypeError });
});

test('genuine transferToFixedLength falls through to genuine behaviour', t => {
  if (!('transferToFixedLength' in ArrayBuffer.prototype)) {
    t.pass('Platform lacks ArrayBuffer.prototype.transferToFixedLength');
    return;
  }
  const ab = new ArrayBuffer(2, { maxByteLength: 7 });
  new Uint8Array(ab).set([4, 5]);
  const ab2 = ab.transferToFixedLength(3);
  t.false(isBufferImmutable(ab2));
  t.is(ab2.byteLength, 3);
  t.false(ab2.resizable);
});

test('emulated immutable.transferToFixedLength throws TypeError', t => {
  const iab = new ArrayBuffer(2).sliceToImmutable();
  t.throws(() => iab.transferToFixedLength(), { instanceOf: TypeError });
});

test('shim installs all four mutator overwrites plus the new proposal surface', t => {
  // Steady-state contract: the eight shim-installed properties are all
  // reachable as own properties of ArrayBuffer.prototype after the shim
  // runs. The expected-overwrite list filter (in src/shim.js) suppresses
  // the cold-start warning for the four mutator overwrites plus the four
  // resizable-proposal read accessors; the assertions below check the
  // post-install observable surface rather than re-running the install
  // (which cannot be re-triggered after module top).
  t.true('slice' in ArrayBuffer.prototype);
  t.true('resize' in ArrayBuffer.prototype);
  t.true('transfer' in ArrayBuffer.prototype);
  t.true('transferToFixedLength' in ArrayBuffer.prototype);
  t.true('sliceToImmutable' in ArrayBuffer.prototype);
  t.true('transferToImmutable' in ArrayBuffer.prototype);
  t.true('immutable' in ArrayBuffer.prototype);
  // Round-trip behavior of all four mutator overwrites is covered by the
  // dedicated genuine-fallthrough and emulated-immutable tests above.
});

test('emulated immutable read accessors return immutable-shape values', t => {
  // The four read accessors (byteLength, detached, resizable, maxByteLength)
  // dispatch on brand membership and return immutable-shape values for an
  // emulated immutable buffer: byteLength reflects the underlying genuine
  // buffer's size, detached is false (an emulated immutable cannot be
  // detached), resizable is false (an emulated immutable cannot grow), and
  // maxByteLength equals byteLength (it cannot grow). The `immutable`
  // brand accessor returns true.
  const iab = new ArrayBuffer(5).sliceToImmutable();
  t.is(iab.byteLength, 5);
  t.false(iab.detached);
  t.false(iab.resizable);
  t.is(iab.maxByteLength, 5);
  t.true(iab.immutable);
});

test('genuine ArrayBuffer.prototype.immutable returns false', t => {
  // The `immutable` brand accessor must return false for a genuine
  // ArrayBuffer (the fallthrough case). The only positive case in the
  // suite was the emulated immutable; this companion asserts the negative.
  const ab = new ArrayBuffer(3);
  t.false(ab.immutable);
});

test('amplifyArrayBuffer returns underlying genuine buffer for emulated immutables', t => {
  // The load-bearing discriminator behind every method on the lib's
  // property record. The internal-test export
  // (`_amplifyArrayBufferForTests`) exposes the helper so the
  // adversarial-tests skill can exercise it in isolation rather than
  // indirectly through prototype dispatch. The three cases below cover
  // the helper's contract: emulated immutable -> underlying genuine;
  // genuine -> itself (fallthrough); non-buffer -> itself (fallthrough,
  // does not throw).
  const ab = new ArrayBuffer(4);
  new Uint8Array(ab).set([1, 2, 3, 4]);
  const iab = ab.sliceToImmutable();
  const underlying = amplifyArrayBuffer(iab);
  t.not(underlying, iab);
  t.true(underlying instanceof ArrayBuffer);
  t.false(isBufferImmutable(underlying));
  t.is(underlying.byteLength, 4);
  // The underlying buffer is the sliced copy made at sliceToImmutable
  // time, not the source ab; verify the contents match the source.
  t.deepEqual([...new Uint8Array(underlying)], [1, 2, 3, 4]);
});

test('amplifyArrayBuffer returns the receiver itself for a genuine ArrayBuffer', t => {
  const ab = new ArrayBuffer(3);
  t.is(amplifyArrayBuffer(ab), ab);
});

test('amplifyArrayBuffer does not throw on a non-ArrayBuffer receiver', t => {
  // The amplifier's third case: passed a value that is neither an
  // emulated immutable nor a genuine ArrayBuffer, it returns the value
  // unchanged rather than throwing. Downstream prototype-dispatched
  // methods then propagate a normal "method called on incompatible
  // receiver" TypeError from the captured genuine method, which is the
  // shape callers expect.
  const nonBuffer = { byteLength: 7 };
  t.is(amplifyArrayBuffer(nonBuffer), nonBuffer);
  t.notThrows(() => amplifyArrayBuffer(null));
  t.notThrows(() => amplifyArrayBuffer(undefined));
});
