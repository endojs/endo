# Nat
[![Build Status][circleci-svg]][circleci-url]
[![dependency status][deps-svg]][deps-url]
[![dev dependency status][dev-deps-svg]][dev-deps-url]
[![License][license-image]][license-url]

Numbers in a programming language are meaningful because we take them to
represent abstract mathematical numbers. JavaScript has two data types
representing numbers, *JS numbers* (IEEE 64 bit floating point) and *bigints*
(arbitrary precision integers). Not all abstact mathematical
numbers are representable by these data types, and not all values of one of
these data types represent mathematical numbers (The JS number type's `NaN`,
`Infinity`, and `-Infinity`). Because JavaScript uses "number" to refer to
its floating point data type, we'll always say "mathematical number" when
that's what we mean.

This package is concerned with the mathematical *natural numbers*, the non-negative
integers. All of these can be safely represented as bigints, given enough
memory. Some of these can be represented as JS numbers, and a smaller set can
*safely* be represented as JS numbers, given a specific notion of safety.

A skippable detail about floating point:
  * The JavaScript expression `2**70` evaluates to a JS number that exactly
  represents the mathematical number you expect. However, the JavaScript
  expression `2**70+1 === 2**70` evaluates to `true` because this JS number is
  outside the contiguous range of integers that the JS number type can
  represent *unambiguously*.
  The contiguous range of exactly representable integers is
  `-(2**53)` to `2**53`. However, `2**53+1 === 2**53` is `true`, demonstrating
  that other integers will round to `2**53`. The JavaScript standard defines
  the [*safe* JS numbers](https://tc39.es/ecma262/#sec-number.issafeinteger)
  to be the JS numbers that represent mathematical integers and lie in the
  range `-(2**53-1)` to `2**53-1` . The JS safe natural numbers are the
  non-negative subset of that, between `0` and `2**53-1`. No other integers
  coerce to any of these. If in JavaScript `a + b === c` and all three values
  are JS safe integers, then this accurately represents the mathematical sum
  of the mathematical numbers they represent.

The bigint datatype, by contrast, is inherently safe. Every bigint `>= 0n`
safely represents a natural number.

This package exports two functions, `isNat(allegedNum)` and `Nat(allegedNum)`.

## isNat(allegedNum: any) => boolean

```js
isNat(3); // true
isNat(3n); // true
isNat('3'); // false
isNat(2**70); // false
isNat(2n**70n); // true
isNat(-3n); // false
isNat(3.1); // false
```

The `isNat` function is a predicate that accepts any input and returns `true`
iff that input safely represents a natural number, i.e., if it is a non-negative
bigint or it is a non-negative JS number safely representing an integer. To the
extent that we consider this abstract notion of mathematical natural number a
type, `isNat` is a *type tester* of possible representations of this type.

## Nat(allegedNum: bigint | number) => bigint

```js
Nat(3); // 3n
Nat(3n); // 3n
Nat('3'); // throws TypeError
Nat(2 ** 70); // throws RangeError
Nat(2n ** 70n); // 1180591620717411303424n
Nat(-3); // throws RangeError
Nat(3.1); // throws RangeError
```

The `Nat` function accepts exactly those values that pass the `isNat`
predicate. For those it returns a bigint that represents the same natural
number. Otherwise it throws.

## Validators and Coercers

Functions like `Nat` and the standard JavaScript `BigInt` can be
classified _validators_ or _coercers_.

When a validator accepts---returns normally rather than throwing---the caller
knows that their input argument is as expected, and the output is the same as
the input. When a coercer accepts, the caller knows that the output is as
expected, but only knows that the input was one the coercer was willing to
convert from. The `BigInt` function is a coercer. It will even accept
strings as input but its output is always a bigint. `Nat` is an interesting
mixture. It is a coercer at one level of abstraction, and a validator at
another level of abstraction.

At the level of concrete JavaScript data representations, `Nat` is clearly a
coercer---`Nat` will convert a qualifying JS number into a bigint. At the level
of abstraction of the mathematical number any accepted input represents, `Nat`
is a validator. If `Nat` succeeds the caller knows that their input safely
represents some abstract mathematical natural number, and that the output
safely represents the same abstract mathematical natural number. At this level
of abstraction, on success, the output is the same as the input.

## History

`Nat` comes from the Google Caja project, which tested whether a JS number was a
primitive integer within the range of continguously and unambiguously
representable non-negative integers.

For more, see the [discussion in TC39 notes](https://github.com/rwaldron/tc39-notes/blob/master/es6/2013-07/july-25.md#59-semantics-and-bounds-of-numberisinteger-and-numbermax_integer)


[circleci-svg]: https://circleci.com/gh/Agoric/nat.svg?style=svg
[circleci-url]: https://circleci.com/gh/Agoric/nat
[deps-svg]: https://david-dm.org/Agoric/Nat.svg
[deps-url]: https://david-dm.org/Agoric/Nat
[dev-deps-svg]: https://david-dm.org/Agoric/Nat/dev-status.svg
[dev-deps-url]: https://david-dm.org/Agoric/Nat?type=dev
[license-image]: https://img.shields.io/badge/License-Apache%202.0-blue.svg
[license-url]: LICENSE
