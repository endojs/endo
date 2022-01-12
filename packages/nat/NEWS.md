
## Release v4.1.0 (2021-06-09)

* Adds support for loading with the Endo module loader.  Supporting `node -r
  esm` on versions of Node.js that have native ESM support and Endo
  simultaneously requires specialized `parsers` metadata in `package.json`.
  A future version may drop support for `-r esm` in favor of supporting
  native Node.js module loader and Endo together with just the `"type":
  "module"` metadata that is an emerging de-facto standard.

## Release v4.0.0 (2021-01-29)

* BREAKING CHANGE: In addition to non-negative bigints, `Nat` will also accept a
  non-negative number with the range of
  [integers safely representable in floating point](https://tc39.es/ecma262/#sec-number.issafeinteger).
  Its output will always be a non-negative bigint or a thrown error.
* Also exports an `isNum` function which can be used to test anything without
  error. It returns a boolean indicating whether the argument is accepted by
  `Nat` as input.
* There is no longer a default export. Both `isNat` and `Nat` are exported
  by name.

## Release v3.0.1 (12/4/2019)

* Re-release v3.0.0 after running `npm run build` (previous release
  did not publish the built files)

## Release v3.0.0 (12/3/2019)

* BREAKING CHANGE: `Nat(value)` now requires `value` to be a `BigInt`
  rather than a safe `number`. Using `BigInts`, arbitrarily large
  integers can be represented.
* Error messages were made more informative
