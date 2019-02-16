# MakeHardener

[![Build Status][travis-svg]][travis-url]
[![dependency status][deps-svg]][deps-url]
[![dev dependency status][dev-deps-svg]][dev-deps-url]
[![License][license-image]][license-url]

Build a defensible API surface around an object by freezing all reachable properties.

## How to use

> Note: If you're writing an application, you probably don't want to use this package directly. You'll want to use the `harden()` function provided in [SES](https://github.com/Agoric/SES) to perform an all-encompassing "deep freeze" on your objects. Alternatively, if you want to test your code before using it in SES, you can import the [@agoric/harden package](https://github.com/Agoric/Harden). Note that without SES, `harden()` is insecure, and should be used for testing purposes only.

## Why do we need to "harden" objects?

Please see the [harden()](https://github.com/Agoric/Harden) package for more documentation.

## Creating a custom harden() Function

This package (`@agoric/make-hardener`) provides a `makeHardener()` which can be used to build your own `harden()` function. When you call `makeHardener()`, you give it a set of stopping points, and the recursive property walk will stop its search when it runs into one of these points. The resulting `harden()` will throw an exception if anything it freezes has a prototype that is not already in the set of stopping points (or was frozen during the same call).

[travis-svg]: https://travis-ci.com/Agoric/MakeHardener.svg?branch=master
[travis-url]: https://travis-ci.com/Agoric/MakeHardener
[deps-svg]: https://david-dm.org/Agoric/MakeHardener.svg
[deps-url]: https://david-dm.org/Agoric/MakeHardener
[dev-deps-svg]: https://david-dm.org/Agoric/MakeHardener/dev-status.svg
[dev-deps-url]: https://david-dm.org/Agoric/MakeHardener?type=dev
[license-image]: https://img.shields.io/badge/License-Apache%202.0-blue.svg
[license-url]: LICENSE
