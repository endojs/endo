User-visible changes in `@endo/marshal`:

# 1.8.0 (2025-07-11)

- Introduces an environment variable config option `ENDO_RANK_STRINGS` to change the rank ordering of strings from the current (incorrect) ordering by UTF-16 code unit used by JavaScript's `<` and `.sort()` operations to (correct and OCapN-conformant) ordering by Unicode code point. It currently defaults to "utf16-code-unit-order", matching the previously-unconditional behavior.

# v1.7.0 (2025-06-02)

- `@endo/marshal` now also exports a `qp` function meaning "quote passable"
  that renders its passable argument as a quasi-quoted Justin expression.
  This can be used with `X`, `Fail` etc the same way you currently use `q`.
  Since Justin is a subset of HardenedJS, there's no need for the quasi-quoted
  form to explain what language it is in.

# v1.6.0 (2024-10-22)

- `compareRank` now short-circuits upon encountering remotables to compare,
  considering the inputs to be tied for the same rank regardless of what would
  otherwise be visited later in their respective data structures. This ensures
  that a `fullCompare` which does distinguish remotables will be a refinement
  of `compareRank`, rather than disagreeing about whether or not two values
  share a rank ([#2588](https://github.com/endojs/endo/issues/2588)).

  This change is a bug fix for all purposes off-chain, but will frustrate
  deterministic replay.
  So, because of this change and probably many others, the supervisor bundle
  of vats on chain will need to be created from historical versions, not according
  to the semantic version of the library.

# v1.5.1 (2024-07-30)

- `deeplyFulfilled` moved from @endo/marshal to @endo/pass-style. @endo/marshal
  still reexports it, to avoid breaking old importers. But importers should be
  upgraded to import `deeplyFulfilled` directly from @endo/pass-style.

# v1.3.0 (2024-02-22)

- Sending and receiving extended errors.
  - As of the previous release, `@endo/marshal` tolerates extra error
    properties with `Passable` values. However, all those extra properties
    were only recorded in annotations, since they are not recognized as
    legitimate on `Passable` errors.
  - This release will use these extra properties to construct an error object
    with all those extra properties, and then call `toPassableError` to make
    the locally `Passable` error that it returns. Thus, if the extra properties
    received are not recognized as a legitimate part of a locally `Passable`
    error, the error with those extra properties itself becomes the annotation
    on the returned `Passable` error.
  - An `error.cause` property whose value is a `Passable` error with therefore
    show up on the returned `Passable` error. If it is any other `Passable`
    value, it will show up on the internal error used to annotate the
    returned error.
  - An `error.errors` property whose value is a `CopyArray` of `Passable`
    errors will likewise show up on the returned `Passable` error. Otherwise,
    only on the internal error annotation of the returned error.
  - Although this release does otherwise support the error properties
    `error.cause` and `error.errors` on `Passable` errors, it still does not
    send these properties because releases prior to the previous release
    do not tolerate receiving them. Once we no longer need to support
    releases prior to the previous release, then we can start sending these.

# v1.2.0 (2024-02-14)

- Tolerates receiving extra error properties (https://github.com/endojs/endo/pull/2052). Once pervasive, this tolerance will eventually enable additional error properties to be sent. The motivating examples are the JavaScript standard properties `cause` and `errors`. This change also enables smoother interoperation with other languages with their own theories about diagnostic information to be included in errors.

# v0.8.1 (2022-12-23)

- Remote objects now reflect methods present on their prototype chain.
- Serialization errors now serialize.

# v0.8.0 (2022-10-24)

- Requires plain objects to inherit from Object.prototype, ensuring pass-invariance
  ([#1324](https://github.com/endojs/endo/issues/1324))
  ([1df4193](https://github.com/endojs/endo/commit/1df419350c2d18a9551a918b08dec5c43712043f))

# v0.7.5 (2022-09-27)

- Adds "smallcaps" encoding
  ([#1282](https://github.com/endojs/endo/issues/1282))
  ([233dbe2](https://github.com/endojs/endo/commit/233dbe2e159e454fd3bcdd0e08b15c4439b56ba7))

# v0.7.1 (2022-18-25)

- Allows for the existence of `async_hooks` symbols on promises.

# v0.7.0 (2022-08-23)

- Prepares for far classes.
- Full `passStyleOf` input validation.
- *BREAKING*: Removes `assertPure`, which was wrong but not used to the best of
  our knowledge.

# v0.6.0 (2021-02-18)

Switch from ambient to exported types.
Include type declarations (`.d.ts`) generated from JSDoc to avoid requiring
dependents to parse `.js` files in their `node_modules`.

In order to use the types from `@endo/marshal` you now need to import them
explicitly. For example, to make them available in scope, use the following:
- JSDoc: `/** @import {PassStyle} from '@endo/marshal' */`
- TypeScript: `import type { PassStyle } from '@endo/marshal'`


# v0.5.3 (2021-01-27)

Includes TypeScript definitions in published artifact.


# v0.5.1 (2021-01-22)

Moved from https://github.com/Agoric/agoric-sdk to
https://github.com/endojs/endo, still in a `packages/marshal` directory.


---

# v0.1.2 (2019-12-17)

- depend on @agoric/eventual-send (#6)

Moved from https://github.com/Agoric/marshal into the `packages/marshal/`
directory in the monorepo at https://github.com/Agoric/agoric-sdk .


# v0.1.1 (2019-10-02)

Remove unneeded SES dependency.


# v0.1.0 (2019-19-11)

Breaking API change: applications must change how they use m.serialize()
and m.serialize().

- change API to use 'CapData' format: `{body, slots}`
  - `m.serialize()` now returns `{body, slots}` instead of `{argsString, slots}`
  - `m.unserialize()` now takes `(capdata, cyclePolicy)` instead of
    `(body, slots, cyclePolicy)`. The `cyclePolicy` argument remains optional.
- the return value of `m.serialize()` is now hardened
- improve error messages


# v0.0.1 (2019-06-06)

First release.
