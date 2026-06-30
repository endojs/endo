// @ts-nocheck
// Per-flavor parameterized coverage for the freezable-TypedArray emulation.
// Runs a matrix of assertions over all eleven concrete TypedArray constructors.
//
// Per-flavor sample values:
//   - Non-BigInt flavors: 1  (numeric)
//   - BigInt flavors (BigInt64Array, BigUint64Array): 1n  (BigInt)
//
// The BigInt distinction matters because the native TypedArray operations throw
// a TypeError on a type-mismatch *before* reaching the brand check, which
// would mask the mutator-throws path the tests are verifying.
import '../src/shim.js';
import test from 'ava';

const { getPrototypeOf, freeze, isFrozen } = Object;

/**
 * @type {Array<{name: string, Ctor: Function, sample: number|bigint, zero: number|bigint}>}
 */
const flavors = [
  { name: 'Int8Array', Ctor: Int8Array, sample: 1, zero: 0 },
  { name: 'Int16Array', Ctor: Int16Array, sample: 1, zero: 0 },
  { name: 'Int32Array', Ctor: Int32Array, sample: 1, zero: 0 },
  { name: 'Uint8Array', Ctor: Uint8Array, sample: 1, zero: 0 },
  {
    name: 'Uint8ClampedArray',
    Ctor: Uint8ClampedArray,
    sample: 1,
    zero: 0,
  },
  { name: 'Uint16Array', Ctor: Uint16Array, sample: 1, zero: 0 },
  { name: 'Uint32Array', Ctor: Uint32Array, sample: 1, zero: 0 },
  { name: 'Float32Array', Ctor: Float32Array, sample: 1, zero: 0 },
  { name: 'Float64Array', Ctor: Float64Array, sample: 1, zero: 0 },
  { name: 'BigInt64Array', Ctor: BigInt64Array, sample: 1n, zero: 0n },
  { name: 'BigUint64Array', Ctor: BigUint64Array, sample: 1n, zero: 0n },
];

for (const { name, Ctor, sample, zero } of flavors) {
  const tName = label => `${name}: ${label}`;

  // Construction from an immutable buffer

  test(
    tName(
      'construction from an immutable buffer succeeds; __proto__ is T.prototype',
    ),
    t => {
      const ab = new ArrayBuffer(16);
      const iab = ab.sliceToImmutable();
      const view = new Ctor(iab);
      t.is(getPrototypeOf(view), Ctor.prototype);
      t.true(view instanceof Ctor);
    },
  );

  // Mutator methods throw TypeError on frozen wrappers

  test(tName('copyWithin throws TypeError on emulated freezable view'), t => {
    const iab = new ArrayBuffer(16).sliceToImmutable();
    const view = new Ctor(iab);
    t.throws(() => view.copyWithin(0, 1), { instanceOf: TypeError });
  });

  test(tName('fill throws TypeError on emulated freezable view'), t => {
    const iab = new ArrayBuffer(16).sliceToImmutable();
    const view = new Ctor(iab);
    t.throws(() => view.fill(sample), { instanceOf: TypeError });
  });

  test(tName('reverse throws TypeError on emulated freezable view'), t => {
    const iab = new ArrayBuffer(16).sliceToImmutable();
    const view = new Ctor(iab);
    t.throws(() => view.reverse(), { instanceOf: TypeError });
  });

  test(tName('set throws TypeError on emulated freezable view'), t => {
    const iab = new ArrayBuffer(16).sliceToImmutable();
    const view = new Ctor(iab);
    t.throws(() => view.set([sample]), { instanceOf: TypeError });
  });

  test(tName('sort throws TypeError on emulated freezable view'), t => {
    const iab = new ArrayBuffer(16).sliceToImmutable();
    const view = new Ctor(iab);
    t.throws(() => view.sort(), { instanceOf: TypeError });
  });

  // Indexed assignment does not modify the underlying buffer

  test(
    tName(
      'indexed assignment on non-frozen wrapper creates own property; buffer unchanged',
    ),
    t => {
      const ab = new ArrayBuffer(16);
      const iab = ab.sliceToImmutable();
      const view = new Ctor(iab);

      // Byte 0 is the per-flavor zero before assignment.
      t.is(Ctor.prototype.at.call(view, 0), zero);

      // Assign — creates an own property on the plain wrapper.
      view[0] = sample;

      // The own property reads back.
      t.is(view[0], sample);

      // The underlying buffer's byte 0 is still zero.
      t.is(Ctor.prototype.at.call(view, 0), zero);
    },
  );

  test(
    tName(
      'indexed assignment on frozen wrapper throws in strict mode; buffer unchanged',
    ),
    t => {
      // ES modules run in strict mode. In strict mode, assigning to a frozen
      // ordinary object throws TypeError. In non-strict mode the assignment
      // would be silently swallowed. Either way the underlying buffer is
      // unchanged. See designs/freezable-typedarray.md, frozen-wrapper example.
      const iab = new ArrayBuffer(16).sliceToImmutable();
      const view = new Ctor(iab);
      freeze(view);

      // In strict mode (ES module), assigning to a frozen object throws.
      t.throws(
        () => {
          view[0] = sample;
        },
        { instanceOf: TypeError },
      );

      // The underlying buffer's byte 0 is still zero.
      t.is(Ctor.prototype.at.call(view, 0), zero);
    },
  );

  // Read-only surface

  test(tName('byteLength, byteOffset, length return correct values'), t => {
    const ab = new ArrayBuffer(16);
    const iab = ab.sliceToImmutable();
    const view = new Ctor(iab);
    // byteLength and length are flavor-dependent; byteOffset is always 0 here.
    t.is(view.byteOffset, 0);
    t.is(view.byteLength, 16);
    t.is(view.buffer, iab);
  });

  test(tName('at(0) returns correct value'), t => {
    const ab = new ArrayBuffer(16);
    const iab = ab.sliceToImmutable();
    const view = new Ctor(iab);
    t.is(view.at(0), zero);
  });

  test(
    tName('with(0, sample), toReversed, toSorted return correct values'),
    t => {
      const ab = new ArrayBuffer(16);
      const iab = ab.sliceToImmutable();
      const view = new Ctor(iab);

      // `with` is a non-mutating method that returns a new TypedArray.
      // On an emulated freezable wrapper that has no indexed slots, `view.with(0, sample)`
      // delegates via the amplifier to the hidden genuine TypedArray.
      const withResult = view.with(0, sample);
      // The result is a new TypedArray (not the wrapper itself).
      t.not(withResult, view);

      // `toReversed` and `toSorted` are non-mutating; they return new TypedArrays.
      const reversed = view.toReversed();
      t.not(reversed, view);

      const sorted = view.toSorted();
      t.not(sorted, view);
    },
  );

  // Object.freeze

  test(tName('Object.freeze(view); Object.isFrozen(view) === true'), t => {
    const iab = new ArrayBuffer(16).sliceToImmutable();
    const view = new Ctor(iab);
    freeze(view);
    t.true(isFrozen(view));
  });

  // Fallthrough constructor (genuine mutable buffer)

  test(
    tName(
      'fallthrough constructor on genuine mutable buffer produces genuine writable view',
    ),
    t => {
      const realAb = new ArrayBuffer(16);
      const view = new Ctor(realAb);
      t.is(getPrototypeOf(view), Ctor.prototype);
      t.is(view.buffer, realAb);
      // Write succeeds.
      view[0] = sample;
      t.is(view[0], sample);
    },
  );
}
