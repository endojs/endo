User-visible changes in `@endo/marshal`:

# next

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
- JSDoc: `/** @typedef {import('@endo/marshal').PassStyle} PassStyle */`
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
