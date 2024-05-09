import test from 'ava';
import { isNat, Nat } from '../src/index.js';

test('Nat() works for natural BigInts', t => {
  t.is(Nat(1n), 1n);
  t.is(Nat(BigInt('1')), BigInt('1'));
  t.is(Nat(BigInt('1')), 1n);
  t.is(Nat(BigInt(2 ** 53)), BigInt(2 ** 53));
  t.is(Nat(9007199254741000n), 9007199254741000n);
});

test('Nat() throws for non-natural BigInts', t => {
  t.throws(() => Nat(-1n), {
    message: `-1 is negative`,
    instanceOf: RangeError,
  });
});

test('Nat() throws when not a natural number', t => {
  t.is(Nat(0), 0n);
  t.is(Nat(1), 1n);
  t.is(Nat(999), 999n);
  t.is(Nat(3.0), 3n);
  t.throws(() => Nat('not a number'), { instanceOf: TypeError });
  t.throws(() => Nat(-1), { instanceOf: RangeError });
  t.throws(() => Nat(0.5), { instanceOf: RangeError });
  t.throws(() => Nat(2 ** 60), { instanceOf: RangeError });
  t.throws(() => Nat(NaN), { instanceOf: RangeError });
  t.throws(() => Nat(Infinity), { instanceOf: RangeError });
  t.throws(() => Nat('3'), { instanceOf: TypeError });
  t.throws(() => Nat(3.1), { instanceOf: RangeError });

  // works for safe integers only
  t.is(Nat(2 ** 53 - 1), 2n ** 53n - 1n);
  t.throws(() => Nat(2 ** 53), { instanceOf: RangeError });
});

test('isNat examples from the README', t => {
  t.assert(isNat(3));
  t.assert(isNat(3n));
  t.false(isNat('3'));
  t.false(isNat(2 ** 70));
  t.assert(isNat(2n ** 70n));
  t.false(isNat(-3n));
  t.false(isNat(3.1));
});

test('Nat examples from the README', t => {
  t.is(Nat(3), 3n);
  t.is(Nat(3n), 3n);
  t.throws(() => Nat('3'), { instanceOf: TypeError });
  t.throws(() => Nat(2 ** 70), { instanceOf: RangeError });
  t.is(Nat(2n ** 70n), 1180591620717411303424n);
  t.throws(() => Nat(-3n), { instanceOf: RangeError });
  t.throws(() => Nat(3.1), { instanceOf: RangeError });
});
