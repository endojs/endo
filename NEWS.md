## Release v3.0.1 (12/4/2019)

* Re-release v3.0.0 after running `npm run build` (previous release
  did not publish the built files)

## Release v3.0.0 (12/3/2019)

* BREAKING CHANGE: `Nat(value)` now requires `value` to be a `BigInt`
  rather than a safe `number`. Using `BigInts`, arbitrarily large
  integers can be represented.
* Error messages were made more informative
