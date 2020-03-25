/* eslint no-mixed-operators: "off" */

import test from 'tape';
import Nat from '../src/index';

test('Nat() works for natural BigInts', (t) => {
  t.equal(Nat(1n), 1n);
  t.equal(Nat(BigInt('1')), BigInt('1'));
  t.equal(Nat(BigInt('1')), 1n);
  t.equals(Nat(BigInt(2 ** 53)), BigInt(2 ** 53));
  t.equal(Nat(9007199254741000n), 9007199254741000n);
  t.end();
});

test('Nat() throws for non-natural BigInts', (t) => {
  t.throws(() => Nat(-1n), /RangeError: -1 is negative/);
  t.end();
});

test('Nat() throws for non-BigInts', (t) => {
  t.throws(() => Nat(0), /TypeError: 0 is not a BigInt/);
  t.throws(() => Nat(1), /TypeError: 1 is not a BigInt/);
  t.throws(() => Nat(999), /TypeError: 999 is not a BigInt/);
  t.throws(() => Nat(3.0), /TypeError: 3 is not a BigInt/);
  t.throws(
    () => Nat('not a number'),
    /TypeError: not a number is not a BigInt/,
  );
  t.throws(() => Nat(-1), /TypeError: -1 is not a BigInt/);
  t.throws(() => Nat(0.5), /TypeError: 0.5 is not a BigInt/);
  t.throws(
    () => Nat(2 ** 60),
    /TypeError: 1152921504606847000 is not a BigInt/,
  );
  t.throws(() => Nat(NaN), /TypeError: NaN is not a BigInt/);
  t.throws(() => Nat(Infinity), /TypeError: Infinity is not a BigInt/);
  t.throws(() => Nat('3'), /TypeError: 3 is not a BigInt/);
  t.throws(() => Nat(3.1), /TypeError: 3.1 is not a BigInt/);
  t.throws(
    () => Nat(2 ** 53 - 1),
    /TypeError: 9007199254740991 is not a BigInt/,
  );
  t.end();
});
