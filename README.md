# Nat

[![Build Status][travis-svg]][travis-url]
[![dependency status][deps-svg]][deps-url]
[![dev dependency status][dev-deps-svg]][dev-deps-url]
[![License][license-image]][license-url]

`Nat(value)` returns its argument if it represents a non-negative integer (i.e. a "natural number") that can be accurately represented in a Javascript `Number`, specifically (0, 1, 2... to 2 \*\* 53 - 1). Otherwise it throws a `RangeError` exception. This makes it easy to use on incoming arguments, or as an assertion on generated values.

Traditional Javascript has a single `Number` type, which is defined to contain a 64-bit IEEE-754 floating point value. This can safely represent a wide range of integers, but if they get too large, `Number` will lose precision: `2**53 + 1` will give you the same value as `2**53 + 2`. In situations where you care about accuracy rather than range, this would be a problem.

You can think of `Nat()` as a type enforcement.

## How to use

`Nat()` can be used to enforce desired properties on account balances, where precision is important.

For instance, in a deposit scenario, you would want to defend against someone "depositing" a negative value. Use `Nat` to validate the amount to be deposited before proceeding:

```
deposit: function(amount) {
  amount = Nat(amount);
  ...
}
```

We also want to use `Nat()` before using values internally, as a precondition check:

```
Nat(ledger.get(purse));
```

Any addition or subtraction expressions dealing with monetary amounts should protected with `Nat()` to guard against overflow/underflow errors. Without this check, the two balances might both be safe, but their sum might be too large to represent accurately, causing precision errors in subsequent computation:

```
Nat(myOldBal + amount);
const srcNewBal = Nat(srcOldBal - amount);
```

## Non-monetary usage

Array indexes can be wrapped with `Nat()`, to guard against the surprising string coersion of non-integral index values:

```
const a = [2,4,6]
function add(index, value) {
  a[Nat[index]] = value;
}
add(3, 8); // works
add(2.5, 7); // throws rather than add a key named "2.5"
```

Nat can be used even in cases where it is not strictly necessary, for extra protection against human error.

## Bounds

By excluding 2^53, we have the nice invariant that if

`Nat(a)`,  
`Nat(b)`,  
`Nat(a+b)`,

are all true, then `(a+b)` is an accurate sum of a and b.

Future versions of `Nat` will use Javascript's upcoming (`BigInt` standard)[https://tc39.github.io/proposal-bigint/], to increase the range of accurately-representable integers to be effectively unbounded.

## History

Nat comes from the Google Caja project, which tested whether a number was a primitive integer within the range of continguously representable non-negative integers.

For more, see the [discussion in TC39 notes](https://github.com/rwaldron/tc39-notes/blob/master/es6/2013-07/july-25.md#59-semantics-and-bounds-of-numberisinteger-and-numbermax_integer)

[travis-svg]: https://travis-ci.com/Agoric/Nat.svg?branch=master
[travis-url]: https://travis-ci.com/Agoric/Nat
[deps-svg]: https://david-dm.org/Agoric/Nat.svg
[deps-url]: https://david-dm.org/Agoric/Nat
[dev-deps-svg]: https://david-dm.org/Agoric/Nat/dev-status.svg
[dev-deps-url]: https://david-dm.org/Agoric/Nat?type=dev
[license-image]: https://img.shields.io/badge/License-Apache%202.0-blue.svg
[license-url]: LICENSE
