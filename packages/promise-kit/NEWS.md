User-visible changes in `@endo/promise-kit`:

# v0.2.43 (2022-06-28)

Add a `racePromises` export which implements a non-leaky race algorithm.
Add a `/shim.js` entrypoint which replaces `Promise.race` with the same non-leaky version.

# v0.2.31 (2022-01-25)

This change fixes the package such that the code is included in the published
artifact.

# v0.2.30 (2022-01-21) *broken*

This is the first release of this package under the name `@endo/promise-kit`.
Prior releases are named `@agoric/promise-kit` or `@agoric/make-promise`.

# v0.0.4-0.2.30 (unknown)

Created promise-kit to replace produce-promise, renaming `producePromise` to `makePromiseKit`

# v0.0.4 (6-Apr-2020)

Created produce-promise to replace make-promise.

# v0.0.1 (3-Feb-2020)

Moved out of ERTP and created new package `@agoric/make-promise`
