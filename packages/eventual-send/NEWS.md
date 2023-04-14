User-visible changes in eventual-send:

# v0.17.1 (2023-04-14)

- Defaults to `TRACK_TURNS=disabled`

# v0.16.3 (2022-08-26)

- Actually fixes eventual-send when used in combination with the `-r esm`
  module loader, which does not support JavaScript's nullish operators.

# v0.16.2 (2022-08-26)

- [sic] Fixes eventual-send when used in combination with the `-r esm` module
  loader, which does not support JavaScript's nullish operators.

# v0.16.1 (2022-08-25)

- Adds support `DEBUG=track-turns` and `TRACK_TURNS=enabled` environment
  variables, such that turn tracking is disabled and quiet by default.
  We believe that we have mitigated a memory leak in stack retention, and hope
  to enable turn-tracking by default when we have verified that the feature no
  longer leaks.

# v0.16.0 (2022-08-23)

- *BREAKING*: Disallow using E proxy methods as functions.
  Enforces the `E(x).foo()` calling convention and disallows using as bound
  methods. Constructs like `const foo = E(x).foo; foo()` now cause a rejection.

# v0.14.2 (2022-01-25)

- Eventual send now hardens arguments and results (values and errors).


# v0.14.1 (2022-01-22)

Moved from https://github.com/Agoric/agoric-sdk to
https://github.com/endojs/endo.


# Unknown version

Removed obsolete `HandledPromise.unwrap` and `E.unwrap` functions.


# v0.5.0 (2019-12-17)

Implement updated `HandledPromise` interface:

- use `new HandledPromise(...args)` instead of `Promise.makeHandled(...args)`
- use `HandledPromise.resolve(x)` (exported also as `E.resolve(x)`) which
  returns x if it is already a HandledPromise or Promise, or x's corresponding
  HandledPromise, or a new HandledPromise
- the promise handler now uses `get` instead of `GET` and `applyMethod` instead of `POST`
- delete, has, and set traps and their corresponding `E` operations have been removed as per the spec
- the `E.C` experimental "eventual chain" proxy has been removed

Moved from https://github.com/Agoric/eventual-send into the monorepo at
https://github.com/Agoric/agoric-sdk .
