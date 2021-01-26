import test from 'ava';
import Nat from '../src/index';

test('Nat() works for natural BigInts', (t) => {
  t.is(Nat(1n), 1n);
  t.is(Nat(BigInt('1')), BigInt('1'));
  t.is(Nat(BigInt('1')), 1n);
  t.is(Nat(BigInt(2 ** 53)), BigInt(2 ** 53));
  t.is(Nat(9007199254741000n), 9007199254741000n);
});

test('Nat() throws for non-natural BigInts', (t) => {
  t.throws(() => Nat(-1n), {
    message: `-1 is negative`,
    instanceOf: RangeError,
  });
});

test('Nat() throws for non-BigInts', (t) => {
  t.throws(() => Nat(0), {
    message: `0 is not a BigInt`,
    instanceOf: TypeError,
  });
  t.throws(() => Nat(1), {
    message: `1 is not a BigInt`,
    instanceOf: TypeError,
  });
  t.throws(() => Nat(999), {
    message: `999 is not a BigInt`,
    instanceOf: TypeError,
  });
  t.throws(() => Nat(3.0), {
    message: `3 is not a BigInt`,
    instanceOf: TypeError,
  });
  t.throws(() => Nat('not a number'), {
    message: `not a number is not a BigInt`,
    instanceOf: TypeError,
  });
  t.throws(() => Nat(-1), {
    message: `-1 is not a BigInt`,
    instanceOf: TypeError,
  });
  t.throws(() => Nat(0.5), {
    message: `0.5 is not a BigInt`,
    instanceOf: TypeError,
  });
  t.throws(() => Nat(2 ** 60), {
    message: `1152921504606847000 is not a BigInt`,
    instanceOf: TypeError,
  });
  t.throws(() => Nat(NaN), {
    message: `NaN is not a BigInt`,
    instanceOf: TypeError,
  });
  t.throws(() => Nat(Infinity), {
    message: `Infinity is not a BigInt`,
    instanceOf: TypeError,
  });
  t.throws(() => Nat('3'), {
    message: `3 is not a BigInt`,
    instanceOf: TypeError,
  });
  t.throws(() => Nat(3.1), {
    message: `3.1 is not a BigInt`,
    instanceOf: TypeError,
  });
  t.throws(() => Nat(2 ** 53 - 1), {
    message: `9007199254740991 is not a BigInt`,
    instanceOf: TypeError,
  });
});
