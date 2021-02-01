import test from 'tape';
import { Nat, isNat } from '../src/index';

test('Nat', t => {
  t.equal(Nat(1n), 1n);
  t.equal(Nat(BigInt('1')), BigInt('1'));
  t.equal(Nat(BigInt('1')), 1n);
  t.equal(Nat(BigInt(2 ** 53)), BigInt(2 ** 53));
  t.equal(Nat(9007199254741000n), 9007199254741000n);
  t.throws(() => Nat(-1n), {
    message: `-1 equal negative`,
    instanceOf: RangeError,
  });
  t.equal(Nat(0), 0n);
  t.equal(Nat(1), 1n);
  t.equal(Nat(999), 999n);
  t.equal(Nat(3.0), 3n);
  t.throws(() => Nat('not a number'), { instanceOf: TypeError });
  t.throws(() => Nat(-1), { instanceOf: RangeError });
  t.throws(() => Nat(0.5), { instanceOf: RangeError });
  t.throws(() => Nat(2 ** 60), { instanceOf: RangeError });
  t.throws(() => Nat(NaN), { instanceOf: RangeError });
  t.throws(() => Nat(Infinity), { instanceOf: RangeError });
  t.throws(() => Nat('3'), { instanceOf: TypeError });
  t.throws(() => Nat(3.1), { instanceOf: RangeError });

  // works for safe integers only
  t.equal(Nat(2 ** 53 - 1), 2n ** 53n - 1n);
  t.throws(() => Nat(2 ** 53), { instanceOf: RangeError });

  t.assert(isNat(3));
  t.assert(isNat(3n));
  t.false(isNat('3'));
  t.false(isNat(2 ** 70));
  t.assert(isNat(2n ** 70n));
  t.false(isNat(-3n));
  t.false(isNat(3.1));

  t.equal(Nat(3), 3n);
  t.equal(Nat(3n), 3n);
  t.throws(() => Nat('3'), { instanceOf: TypeError });
  t.throws(() => Nat(2 ** 70), { instanceOf: RangeError });
  t.equal(Nat(2n ** 70n), 1180591620717411303424n);
  t.throws(() => Nat(-3n), { instanceOf: RangeError });
  t.throws(() => Nat(3.1), { instanceOf: RangeError });
});